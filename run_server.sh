DIR=$(dirname $0)
echo $DIR
cd $DIR
npm run watch >> output.log 2>> error.log
