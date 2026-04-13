function syncScriptProperties(props) {
  if (typeof props === "string") props = JSON.parse(props);
  PropertiesService.getScriptProperties().setProperties(props);
  return "Set " + Object.keys(props).length + " properties.";
}
