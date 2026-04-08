const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Termux: use polling instead of inotify (avoids ENOSPC file watcher limit)
config.watchFolders = [__dirname];
config.watcher = {
  ...config.watcher,
  watchman: {
    deferStates: [],
  },
  additionalExts: [],
};
config.resolver = {
  ...config.resolver,
  blockList: [
    /node_modules\/.*\/node_modules\/react-native\/.*/,
  ],
};

module.exports = config;
