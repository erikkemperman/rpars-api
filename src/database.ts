import { createConnection, Connection, ConnectionOptionsReader, EntityManager } from "typeorm";
import "reflect-metadata";

import { Credentials } from './credentials';
import { Constants } from './constants';
import * as session from './session'

import { User, Challenge, Session } from './entity';

export class Database {

  static readonly EMPTY_HASH = session.hash('', Credentials.CLIENT_HASH_SALT);

  static async create(): Promise<Database> {
    return createConnection({
      type: 'mariadb',
      host: Credentials.DATABASE_HOST,
      port: Credentials.DATABASE_PORT,
      username: Credentials.DATABASE_USER,
      password: Credentials.DATABASE_PASSWORD,
      database: Credentials.DATABASE_NAME,
      synchronize: true,
      entities: [ 'dist/entity/**/*.js' ],
      logging: ['schema', 'error', 'query']

    }).then(async (connection: Connection) => {
      const db = new Database(connection);
      await db.init();
      return db;
    });
  }

  public readonly connection: Connection;
  public readonly manager: EntityManager;
  public empty_user: User;

  private maintenance_count: number;
  private maintenance_time: number;

  constructor(connection: Connection) {
    this.connection = connection;
    this.manager = connection.manager;
    this.maintenance_count = Constants.MAINTENANCE_REQUESTS;
    this.maintenance_time = 0;
  }

  async init(): Promise<Database> {
    // Insert 'empty' user if needed
    let users: User[] = await this.manager.find(User, {email_hash: Database.EMPTY_HASH});
    let user: User | null = users.length === 1 && users[0] || null;
    if (!user) {
      user = new User();
      user.email_hash = Database.EMPTY_HASH;
      user.client_salt = session.random_string(Constants.NONCE_LENGTH);
      user.iterations = session.random_iterations(Constants.PASSWORD_ITERATIONS);
      const password_hash = session.pbkdf2('password', user.client_salt, user.iterations);
      const client_key = session.hmac(password_hash, 'Client Key');
      user.client_key = session.hash(client_key, '');
      user.server_key = session.hmac(password_hash, 'Server Key');
      user.sessions = Promise.resolve([]);
      await this.manager.save(user);
      this.empty_user = user;
    } else {
      this.empty_user = users[0];
    };
    return this;
  }

  async maintain(): Promise<Database> {
    let now = Date.now();
    this.maintenance_count += 1;
    if (this.maintenance_count >= Constants.MAINTENANCE_REQUESTS || this.maintenance_time <= now) {
      console.debug('Database maintenance');
      this.maintenance_count = 0;
      this.maintenance_time = now + Constants.MAINTENANCE_MILLIS;

      // Delete expired challenges
      await this.connection.createQueryBuilder()
      .delete()
      .from(Challenge)
      .where("expiration < :expiration", { expiration: now })
      .execute();

      // Delete expired sessions
      await this.connection.createQueryBuilder()
      .delete()
      .from(Session)
      .where("expiration < :expiration", { expiration: now })
      .execute();
    }
    return this;
  }

  async fini(): Promise<Database> {
    await this.connection.close();
    return this;
  }
}