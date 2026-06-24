# 运行deepexi-web的menus应用
# 默认deepexi-web工程跟当前工程在同一目录下

# sh ./menus/run.sh deepexiWebDir

menuDir="$(pwd)/menus"
deepexiWebDir=${1:-"../../../deepexi-web"}
menuAppDir="$deepexiWebDir/packages/menus"

if [ ! -d "$menuAppDir" ]; then
    echo "deepexi-web工程不存在"
    exit 1
fi


cd $menuAppDir

if [ ! -d "node_modules" ]; then
  pnpm -F menus i
fi

pnpm dev --dir $menuDir
