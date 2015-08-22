cd "$(dirname "$0")"
cp ../../litegl/build/* ../external
python builder.py deploy_files.txt -o ../build/litescene.min.js -o2 ../build/litescene.js --nomin
chmod a+rw ../build/* 
