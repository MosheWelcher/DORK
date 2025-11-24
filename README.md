# DORK - GroupMe Silencer Bot

**DORK** is a Google Apps Script-based bot for GroupMe designed to help group admins manage unruly members. Unlike standard moderation bots that just kick users immediately, DORK enforces a "Silence" protocol with a three-strike system.

## Features

* **Strike System:** Silenced users are warned when they speak.
* **Auto-Kick:** After **3 violations** (strikes), the user is automatically removed from the group.
* **Admin Protection:** The bot will refuse to silence Group Owners or Admins.
* **Multi-Group Support:** One script deployment can manage multiple groups independently.
* **Web-Based Setup:** Includes a professional UI to select which group to deploy the bot to.
* **Smart Targeting:** target users via `@mention` or by typing their exact nickname.

---

## Prerequisites

1.  A **Google Account** (to host the script).
2.  A **GroupMe Account**.
3.  Access to the [GroupMe Developers Portal](https://dev.groupme.com/).

---

## Installation Guide

### Phase 1: Create the Google Script

1.  Go to [script.google.com](https://script.google.com/) and create a **New Project**.
2.  Create the following 4 files in the editor and paste the code provided in this project:
    * `Code.gs` (Main bot logic)
    * `Setup.gs` (Setup wizard logic)
    * `index.html` (Dashboard UI)
    * `no-token.html` (Landing page UI)
3.  Click **Deploy** > **New Deployment**.
4.  **Select type:** Web App.
5.  **Description:** "DORK Bot v1".
6.  **Execute as:** Me (your email).
7.  **Who has access:** **Anyone** (This is critical so GroupMe can send webhooks to it).
8.  Click **Deploy**.
9.  **Copy the "Web App URL"** (it ends in `/exec`). Keep this safe.

### Phase 2: Configure GroupMe OAuth

1.  Log in to [dev.groupme.com](https://dev.groupme.com/).
2.  Click **Applications** > **Create Application**.
3.  **Callback URL:** Paste the **Web App URL** you copied in Phase 1.
4.  Fill in the other details (Title, Description, etc.) and save.
5.  Copy the **Client ID** generated for your new application.

### Phase 3: Finalize Script Configuration

1.  Go back to your Google Script editor.
2.  Open `Setup.gs`.
3.  Find the line `template.oauthUrl = "YOUR_FULL_OAUTH_URL_HERE";`.
4.  Replace the placeholder with your specific OAuth link:
    ```javascript
    template.oauthUrl = "https://oauth.groupme.com/oauth/authorize?client_id=YOUR_CLIENT_ID_HERE";
    ```
5.  **Save** the file.
6.  **Deploy** > **Manage Deployments** > **Edit** (Pencil icon) > **New Version** > **Deploy**. (You must update the deployment whenever you change HTML/Setup code).

---

## Setup & Deployment

1.  Open your **Web App URL** in a browser.
2.  You will see the "Welcome to DORK" landing page.
3.  Click **Authorize with GroupMe**.
4.  Log in/Approve the application. GroupMe will redirect you back to your script with an `access_token`.
5.  The Dashboard will load, searching for groups where you are an **Owner** or **Admin**.
6.  Select a group from the dropdown and click **Deploy DORK to Group**.
7.  The script will automatically:
    * Register the bot with GroupMe.
    * Save the credentials securely in the script properties.

---

## Usage Commands

All commands are case-insensitive.

### 1. Silence a User
Restricts a user. If they speak, they get a strike.
* **Syntax:** `dork silence @User` or `dork silence UserNickname`
* **Example:** `dork silence @John Doe`

### 2. Unsilence a User
Removes restrictions and resets strikes.
* **Syntax:** `dork unsilence @User`
* **Example:** `dork unsilence @John Doe`

### 3. Check Status
Shows a list of all currently silenced users and their strike counts.
* **Syntax:** `dork show silenced`

---

## Technical Details

* **Database:** The bot uses Google Apps Script `PropertiesService` to store data.
    * **Config:** Stores Access Tokens/Bot IDs mapped by Group ID.
    * **State:** Stores silenced users, mapped by Group ID -> User ID.
* **Rate Limits:** The bot handles standard text messages. Do not use this for high-frequency spam groups as Google Apps Script has daily quota limits (e.g., URL Fetch calls).
* **Security:** The setup process filters groups to ensure the bot is only installed where the user has administrative privileges.

## Troubleshooting

* **"You do not have permission..."**: Ensure you are the Owner or an Admin of the group in GroupMe.
* **Bot doesn't reply**: Ensure you deployed the script as "Anyone" so the webhook is accessible.
* **User not kicked**: The bot cannot kick Admins or Owners. Ensure the bot creator (you) has permissions to kick the target user.

