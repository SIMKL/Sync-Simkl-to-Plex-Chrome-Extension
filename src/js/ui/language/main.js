// https://stackoverflow.com/a/25603630
const OSLanguage = navigator.languages
  ? navigator.languages[0]
  : navigator.language
  ? navigator.language
  : navigator.userLanguage
  ? navigator.userLanguage
  : "en-US";
const OSLanguageStripped = OSLanguage.split("-")[0];

window.SimklPlexLangStrs = {
  get strings() {
    return OSLanguage in this ? this[OSLanguage] : this["en-US"];
  },
  registerLangStrings: function (language, strs) {
    this[language] = strs;
  },
};
