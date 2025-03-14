importScripts('./browser-polyfill.js');

browser.runtime.onInstalled.addListener(function (details) {
  // You can query and reload tabs using chrome.tabs.query and chrome.tabs.reload without 'tabs' permission, as long as the URL of the tab matches the host_permissions.
  //reload calendar upon extension "install", "update", "chrome_update" (details.OnInstalledReason)
  browser.tabs.query({ url: 'https://calendar.google.com/calendar/*' }).then(function (tabs) {
    tabs.forEach(function (tab) {
      browser.tabs.reload(tab.id);
    });
  });
});
