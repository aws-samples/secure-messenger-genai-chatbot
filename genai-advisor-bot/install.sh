#!/bin/sh
if [ -f "/usr/local/nvm/nvm.sh" ]; then
  . /usr/local/nvm/nvm.sh
  nvm use 16
fi

if [ ! -d "files" ]; then
  mkdir files
fi
npm install
