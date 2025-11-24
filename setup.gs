function doGet(e) {
  var token = e.parameter.access_token;

  // 1. If no token, serve the landing page (no-token.html)
  if (!token) {
    var template = HtmlService.createTemplateFromFile('no-token');
    
    // --- OAUTH CONFIGURATION ---
    // PASTE YOUR FULL OAUTH URL HERE
    // It should look like: https://oauth.groupme.com/oauth/authorize?client_id=123456abc
    template.oauthUrl = "YOUR_FULL_OAUTH_URL_HERE";

    return template.evaluate()
        .setTitle("DORK Setup")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // 2. If token exists, serve the configuration dashboard (index.html)
  var template = HtmlService.createTemplateFromFile('index');
  template.token = token; 
  
  return template.evaluate()
      .setTitle("DORK Configuration")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// --- SERVER SIDE FUNCTIONS (Called by index.html via google.script.run) ---

/**
 * Fetches groups where the user is likely an Admin or Owner.
 * UPDATED: Filters out groups by checking ScriptProperties for existing configs.
 */
function getEligibleGroups(token) {
  // 1. Fetch User Info (for ID check)
  var meResponse = UrlFetchApp.fetch("https://api.groupme.com/v3/users/me?token=" + token);
  var me = JSON.parse(meResponse.getContentText()).response;
  var myUserId = me.id;

  // 2. Get all stored properties to check for existing configs
  // We check if a key 'GROUP_{ID}' exists in the database
  var storedProps = PropertiesService.getScriptProperties().getProperties();

  // 3. Fetch Groups
  var groupsResponse = UrlFetchApp.fetch("https://api.groupme.com/v3/groups?per_page=100&token=" + token);
  var groupsData = JSON.parse(groupsResponse.getContentText()).response;

  var eligible = [];

  for (var i = 0; i < groupsData.length; i++) {
    var g = groupsData[i];

    // FILTER: Skip this group if we already have a config for it in Script Properties
    if (storedProps['GROUP_' + g.id]) {
      continue;
    }

    var isOwner = (g.creator_user_id == myUserId);
    var isAdmin = false;

    if (!isOwner && g.members) {
      var memberRecord = g.members.find(function(m) { return m.user_id == myUserId; });
      if (memberRecord && memberRecord.roles) {
        if (memberRecord.roles.indexOf("admin") !== -1 || memberRecord.roles.indexOf("owner") !== -1) {
          isAdmin = true;
        }
      }
    }

    if (isOwner || isAdmin) {
      eligible.push({
        id: g.id,
        name: g.name,
        role: isOwner ? "Owner" : "Admin"
      });
    }
  }

  return eligible;
}

function createBot(token, groupId) {
  // DOCUMENTATION NOTE: https://dev.groupme.com/docs/v3#bots_create
  var scriptUrl = ScriptApp.getService().getUrl();
  var url = "https://api.groupme.com/v3/bots?token=" + token;
  
  var payload = {
    "bot": {
      "name": "DORK", 
      "group_id": groupId,
      "callback_url": scriptUrl
    }
  };
  
  var response = UrlFetchApp.fetch(url, {
    method: "POST", 
    contentType: "application/json",
    payload: JSON.stringify(payload)
  });
  
  var data = JSON.parse(response.getContentText());
  return data.response.bot.bot_id;
}

function saveConfiguration(token, botId, groupId) {
  var props = PropertiesService.getScriptProperties();
  
  // Store config specifically for this group
  // Key: GROUP_123456, Value: {"accessToken": "...", "botId": "..."}
  var config = {
    accessToken: token,
    botId: botId
  };
  props.setProperty('GROUP_' + groupId, JSON.stringify(config));
  
  if (!props.getProperty('RESTRICTED_USERS')) {
    props.setProperty('RESTRICTED_USERS', JSON.stringify({}));
  }
}
