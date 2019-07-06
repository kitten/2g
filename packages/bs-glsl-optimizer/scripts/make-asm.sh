#!/usr/bin/env sh

shopt -s extglob
cd $(dirname "$0")
cd ..

FILES=$(ls \
  include/util/*.c \
  include/mesa/**/*.c \
  include/glsl/glcpp/*.c \
  include/glsl/strtod.c \
  include/glsl/*.cpp \
  src/glsl-optimizer-js.cpp \
)

mkdir -p js

docker run \
  --rm -it -v $(pwd):$(pwd) -w $(pwd) \
  -it trzeci/emscripten emcc \
  -Oz --closure 1 --bind \
  -s SINGLE_FILE=1 -s WASM=0 -s FILESYSTEM=0 \
  -I include -I include/mesa \
  -fno-threadsafe-statics \
  -Wno-deprecated-register \
  -Wno-return-type \
  -o js/glsl-optimizer.js \
  $FILES
