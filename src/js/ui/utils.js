const setCssVar = (property, value) => {
  return document.body.style.setProperty(property, value);
  // return document.querySelector(':root').style.setProperty(property, value);
};

const getCssVar = (property) => {
  return document.body.style.getPropertyValue(property);
  // return document.querySelector(':root').style.getPropertyValue(property);
};

const removeWindowHash = () => {
  // https://stackoverflow.com/a/5298684
  window.history.replaceState(
    "",
    document.title,
    window.location.pathname + window.location.search
  );
};

const debounce = (func, timeout = 400) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, timeout);
  };
};

// string prototype to make it convinient
String.prototype.originUrl = function () {
  return new URL(this).origin + "/";
};

const removeItemOnce = (arr, value) => {
  var index = arr.indexOf(value);
  if (index > -1) {
    arr.splice(index, 1);
  }
  return arr;
};

const inPopup = () => {
  // know if the current view is a popup or a full tab
  // https://stackoverflow.com/a/8921196
  let win = chrome.extension.getViews({ type: "popup" })[0];
  return win !== undefined && win == window;
};
