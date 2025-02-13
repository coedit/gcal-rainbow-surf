import browser from './browser-polyfill.js';

browser.runtime.onInstalled.addListener(function (details) {
  //reload gmail upon extension "install", "update", "chrome_update" (details.OnInstalledReason)
  browser.tabs.query({ url: 'https://calendar.google.com/calendar/*' }).then(function (tabs) {
    tabs.forEach(function (tab) {
      browser.tabs.reload(tab.id);
    });
  });
});
