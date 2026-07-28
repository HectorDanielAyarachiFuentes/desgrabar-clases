// Background script for Firefox WebExtension
browser.action.onClicked.addListener(() => {
  if (browser.sidebarAction) {
    browser.sidebarAction.open();
  }
});
