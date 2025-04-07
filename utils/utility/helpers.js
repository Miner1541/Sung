const crypto = require('crypto');
const fs = require('fs');
const path = require('path');


function generateItemId(category) {
  return `${category.substring(0, 2)}-${crypto.randomBytes(3).toString('hex')}`;
}


function hasAdminRole(member, adminRoleId) {
  return member?.roles?.cache?.has(adminRoleId);
}


function createAccountFile(accountName, category, details) {
  const fileName = `${category}_${accountName}_${Date.now()}.txt`;
  const filePath = path.join(__dirname, '..', 'accounts', fileName);

  fs.writeFileSync(filePath, details);
  return filePath;
}


async function getAccountDetails(client, category, itemId) {
  const snapshot = await client.db.ref(`categories/${category}/items/${itemId}/details`).once('value');
  return snapshot.val();
}


async function removeAccountDetail(client, category, itemId, detailId) {
  await client.db.ref(`categories/${category}/items/${itemId}/details/${detailId}`).remove();
}

module.exports = { 
  generateItemId, 
  hasAdminRole, 
  createAccountFile,
  getAccountDetails,
  removeAccountDetail
};
