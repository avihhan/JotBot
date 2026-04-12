function syncScriptProperties(jsonString) {
  var props = JSON.parse(jsonString);
  PropertiesService.getScriptProperties().setProperties(props);
  return "Set " + Object.keys(props).length + " properties.";
}
