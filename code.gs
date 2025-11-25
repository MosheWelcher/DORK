// COMMANDS
var CMD_SILENCE = 'dork silence';   // Usage: dork silence @User (Case insensitive)
var CMD_UNSILENCE = 'dork unsilence'; // Usage: dork unsilence @User (Case insensitive)
var CMD_SHOW_SILENCED = 'dork show silenced'; // Usage: dork show silenced
var MAX_STRIKES = 3;

/**
 * Standard entry point for GroupMe Webhooks
 */
function doPost(e) {
  try {
    var post = JSON.parse(e.postData.contents);
    var text = post.text ? post.text.trim() : "";
    var lowerText = text.toLowerCase(); 
    var senderId = post.user_id;
    var groupId = post.group_id;
    var senderType = post.sender_type;

    // Ignore bot messages
    if (senderType === 'bot') {
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }

    // LOAD GROUP CONFIGURATION
    var config = getGroupConfig(groupId);
    if (!config) {
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }

    // 1. CHECK FOR ADMIN COMMANDS
    if (lowerText.indexOf(CMD_SILENCE) === 0 || 
        lowerText.indexOf(CMD_UNSILENCE) === 0 || 
        lowerText.indexOf(CMD_SHOW_SILENCED) === 0) {
          
      if (isAdmin(groupId, senderId, config.accessToken)) {
        handleCommands(post, lowerText, groupId, config);
      } else {
        postMessage("You do not have permission to manage silenced users.", config.botId);
      }
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }

    // 2. CHECK IF SENDER IS RESTRICTED
    checkRestrictedUser(post, config);

    return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);

  } catch (error) {
    Logger.log('Error: ' + error.toString());
    return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
  }
}

/**
 * Handles the logic for adding/removing users from the restricted list
 */
function handleCommands(post, commandText, groupId, config) {
  
  // --- NEW COMMAND: SHOW SILENCED ---
  // We check this first because it doesn't require finding a target user
  if (commandText.indexOf(CMD_SHOW_SILENCED) === 0) {
    var db = getDatabase();
    var groupData = db[groupId];

    if (!groupData || Object.keys(groupData).length === 0) {
      postMessage("No users are currently silenced in this group.", config.botId);
      return;
    }

    var msg = "Silenced Users:\n";
    for (var uid in groupData) {
      var record = groupData[uid];
      msg += "- " + record.name + " (Strikes: " + record.strikes + "/" + MAX_STRIKES + ")\n";
    }
    postMessage(msg, config.botId);
    return;
  }
  // ----------------------------------

  var attachments = post.attachments || [];
  var targetUserId = null;
  var targetName = ""; 
  
  // 1. Try to find via @MENTION
  var mention = attachments.find(function(a) {
    return a.type === 'mentions';
  });
  
  if (mention && mention.user_ids && mention.user_ids.length > 0) {
    targetUserId = mention.user_ids[0];
    
    // FIX: Fetch the actual nickname for the mentioned user ID
    var groupData = fetchGroupDetails(groupId, config.accessToken);
    if (groupData && groupData.members) {
      var foundMember = groupData.members.find(function(m) {
        return m.user_id == targetUserId;
      });
      
      if (foundMember) {
        targetName = foundMember.nickname;
      } else {
        targetName = "User " + targetUserId; // Fallback if ID not found in roster
      }
    } else {
      targetName = "User " + targetUserId; // Fallback if fetch fails
    }
  } 
  // 2. If no mention, try to find via TEXT MATCH (Nickname)
  else {
    var nameQuery = "";
    if (commandText.indexOf(CMD_SILENCE) === 0) {
      nameQuery = commandText.substring(CMD_SILENCE.length).trim();
    } else if (commandText.indexOf(CMD_UNSILENCE) === 0) {
      nameQuery = commandText.substring(CMD_UNSILENCE.length).trim();
    }

    // NEW LOGIC: Remove leading '@' if the user typed it manually
    // This allows "dork silence @John" to work even if it isn't a blue clickable link
    if (nameQuery.indexOf("@") === 0) {
      nameQuery = nameQuery.substring(1).trim();
    }

    if (nameQuery.length > 0) {
      var groupData = fetchGroupDetails(groupId, config.accessToken);
      if (groupData && groupData.members) {
        var foundMember = groupData.members.find(function(m) {
          return m.nickname.toLowerCase() === nameQuery;
        });
        
        if (foundMember) {
          targetUserId = foundMember.user_id;
          targetName = foundMember.nickname;
        }
      }
    }
  }

  if (!targetUserId) {
    postMessage("User not found. Please @mention them or type their exact nickname.", config.botId);
    return;
  }

  // --- SAFETY CHECK: Prevent silencing Admins/Owners ---
  if (commandText.indexOf(CMD_SILENCE) === 0) {
    if (isAdmin(groupId, targetUserId, config.accessToken)) {
      postMessage("I cannot silence an Admin or Owner.", config.botId);
      return;
    }
  }
  // ----------------------------------------------------

  var db = getDatabase();

  if (!db[groupId]) {
    db[groupId] = {};
  }

  if (commandText.indexOf(CMD_SILENCE) === 0) {
    db[groupId][targetUserId] = {
      strikes: 0,
      name: targetName 
    };
    saveDatabase(db);
    postMessage("User silenced (" + targetName + "). 0/" + MAX_STRIKES + " strikes. They will be removed after 3 violations.", config.botId);
  } 
  else if (commandText.indexOf(CMD_UNSILENCE) === 0) {
    if (db[groupId] && db[groupId][targetUserId]) {
      delete db[groupId][targetUserId];
      saveDatabase(db);
      postMessage(targetName + " unsilenced. They may speak freely.", config.botId);
    } else {
      postMessage("That user was not silenced in this group.", config.botId);
    }
  }
}

/**
 * Monitors messages for restricted users and applies strikes/kicks
 */
function checkRestrictedUser(post, config) {
  var db = getDatabase();
  var senderId = post.user_id;
  var groupId = post.group_id;

  // Check if this group has any restrictions AND if the sender is restricted
  if (db[groupId] && db[groupId][senderId]) {
    
    db[groupId][senderId].strikes += 1;
    var currentStrikes = db[groupId][senderId].strikes;
    var userName = db[groupId][senderId].name || "User";

    // Prepare Mention Attachment
    // Text will be: "@Name MESSAGE..."
    var mentionText = "@" + userName + " ";
    var attachments = [{
      "type": "mentions",
      "user_ids": [senderId],
      "loci": [[0, mentionText.length - 1]] // Loci is [start, length]
    }];

    if (currentStrikes >= MAX_STRIKES) {
      postMessage(mentionText + "Violation limit reached (" + currentStrikes + "/" + MAX_STRIKES + "). Removing user...", config.botId, attachments);
      
      var membershipId = getMembershipId(post.group_id, senderId, config.accessToken);
      
      if (membershipId) {
        var success = kickMember(post.group_id, membershipId, config.accessToken, config.botId);
        if (success) {
          delete db[groupId][senderId]; 
        }
      } else {
        postMessage("Error: Could not find membership ID. They may have already left.", config.botId);
        delete db[groupId][senderId];
      }
    } else {
      postMessage(mentionText + "SILENCE VIOLATION! You are restricted from speaking. Strike " + currentStrikes + "/" + MAX_STRIKES + ".", config.botId, attachments);
    }
    
    saveDatabase(db);
  }
}

// ==========================================
// CONFIGURATION & DATABASE HELPER FUNCTIONS
// ==========================================

function getGroupConfig(groupId) {
  var props = PropertiesService.getScriptProperties();
  var json = props.getProperty('GROUP_' + groupId);
  return json ? JSON.parse(json) : null;
}

function getDatabase() {
  var props = PropertiesService.getScriptProperties();
  var data = props.getProperty('RESTRICTED_USERS');
  return data ? JSON.parse(data) : {};
}

function saveDatabase(data) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('RESTRICTED_USERS', JSON.stringify(data));
}

// ==========================================
// API HELPER FUNCTIONS
// ==========================================

/**
 * Updated to accept attachments (for mentions)
 */
function postMessage(text, botId, attachments) {
  var payload = {
    "bot_id": botId,
    "text": text,
    "attachments": attachments || [] // Default to empty array if undefined
  };
  
  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  
  UrlFetchApp.fetch("https://api.groupme.com/v3/bots/post", options);
}

function kickMember(groupId, membershipId, accessToken, botId) {
  var url = "https://api.groupme.com/v3/groups/" + groupId + "/members/" + membershipId + "/remove?token=" + accessToken;
  var options = {
    "method": "post",
    "muteHttpExceptions": true
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    
    if (code === 200) {
      return true;
    } else if (code === 400 || code === 403) {
      postMessage("Failed to remove member. I cannot remove Owners or Admins, or my token lacks permission.", botId);
      return false;
    } else if (code === 404) {
      return true;
    }
    return false;
  } catch (e) {
    Logger.log(e);
    return false;
  }
}

/**
 * Checks if the sender is an admin or owner.
 * UPDATED: Fetches the Group object to check 'creator_user_id' explicitly.
 */
function isAdmin(groupId, userId, accessToken) {
  var group = fetchGroupDetails(groupId, accessToken);
  if (!group) return false;

  // 1. Direct Owner Check (Most reliable)
  if (group.creator_user_id == userId) {
    return true;
  }

  // 2. Member Role Check (For other admins)
  if (group.members) {
    var member = group.members.find(function(m) {
      return m.user_id == userId;
    });
    
    if (member && member.roles && (member.roles.indexOf("admin") !== -1 || member.roles.indexOf("owner") !== -1)) {
      return true;
    }
  }
  
  return false;
}

function getMembershipId(groupId, userId, accessToken) {
  var group = fetchGroupDetails(groupId, accessToken);
  if (!group || !group.members) return null;

  var member = group.members.find(function(m) {
    return m.user_id == userId;
  });
  return member ? member.id : null;
}

/**
 * Helper to fetch the FULL GROUP details (including creator_user_id)
 * Replaced the old fetchGroupMembers function.
 */
function fetchGroupDetails(groupId, accessToken) {
  var url = "https://api.groupme.com/v3/groups/" + groupId + "?token=" + accessToken;
  var options = { "muteHttpExceptions": true };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() !== 200) {
      Logger.log("Failed to fetch group details: " + response.getContentText());
      return null;
    }
    
    var json = JSON.parse(response.getContentText());
    // The group details endpoint returns { response: { id: "...", members: [...] } }
    return json.response;
  } catch (e) {
    Logger.log(e);
    return null;
  }
}
