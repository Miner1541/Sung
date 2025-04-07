const { SlashCommandBuilder } = require('discord.js');
const { soloLevelingEmbed } = require('../utils/embeds');
const { logAction } = require('../utils/logger');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purchase')
    .setDescription('Purchase an account.')
    .addStringOption(option => option.setName('name').setDescription('Account name').setRequired(true))
    .addIntegerOption(option => 
      option.setName('quantity')
      .setDescription('Quantity to purchase (maximum 2000)')
      .setRequired(false)
      .setMaxValue(2000)),

  async execute(interaction, client) {
    // Defer the reply since this operation might take time
    await interaction.deferReply({ ephemeral: true });
    
    const accountName = interaction.options.getString('name');
    let requestedQuantity = interaction.options.getInteger('quantity') || 1;
    
    // Enforce maximum quantity limit of 2000
    if (requestedQuantity > 2000) {
      requestedQuantity = 2000;
    }
    
    // Find the account in the database
    const snapshot = await client.db.ref('categories').once('value');
    let account = null, category = null, itemId = null;

    snapshot.forEach(catSnap => {
      const items = catSnap.child('items');
      items.forEach(itemSnap => {
        const itemData = itemSnap.val();
        if (itemData.name && itemData.name.toLowerCase() === accountName.toLowerCase()) {
          account = itemData;
          category = catSnap.key;
          itemId = itemSnap.key;
        }
      });
    });

    if (!account) {
      return interaction.editReply({ embeds: [soloLevelingEmbed('Not Found', `No account found with the name **${accountName}**.`)] });
    }

    if (account.quantity <= 0) {
      return interaction.editReply({ embeds: [soloLevelingEmbed('Out of Stock', `**${accountName}** is currently out of stock.`)] });
    }
    
    // Check if enough quantity is available
    const availableQuantity = Math.min(account.quantity, requestedQuantity);
    const totalCost = account.price * availableQuantity;
    
    // Check user balance before proceeding
    const userRef = client.db.ref(`users/${interaction.user.id}`);
    const userSnapshot = await userRef.once('value');
    const userData = userSnapshot.val() || {};
    const userBalance = userData.balance || 0;
    
    // Log the values for debugging
    console.log(`User: ${interaction.user.username}, Balance: $${userBalance}, Required: $${totalCost}`);
    
    // Check if user has enough balance
    if (userBalance < totalCost) {
      return interaction.editReply({ 
        embeds: [soloLevelingEmbed('Insufficient Balance', 
          `You don't have enough balance to complete this purchase.\nYour balance: $${userBalance}\nRequired: $${totalCost}`
        )] 
      });
    }
    
    // Before processing the purchase, check if DMs are open
    let dmChannel;
    try {
      dmChannel = await interaction.user.createDM();
      // Send a test message and delete it immediately to verify DMs work
      const testMessage = await dmChannel.send("Checking if DMs are available...");
      await testMessage.delete();
    } catch (error) {
      // DMs are closed - inform the user and don't process the transaction
      await logAction(client, `⚠️ Failed purchase: ${interaction.user.username} tried to buy ${availableQuantity} ${accountName} accounts but has DMs closed.`);
      return interaction.editReply({ 
        embeds: [soloLevelingEmbed('DMs Closed', 
          `Your purchase could not be processed because your DMs are closed. Please enable direct messages from server members in your privacy settings and try again.`
        )] 
      });
    }
    
    // Process the purchase using transaction for security
    try {
      // Start a transaction to ensure balance changes are atomic
      let transactionSuccess = false;
      
      await client.db.ref().transaction((mutableData) => {
        // Get current user data
        if (!mutableData) {
          console.error('Transaction data is null');
          return null; // Abort transaction
        }
        
        // Initialize users object if it doesn't exist
        if (!mutableData.users) {
          mutableData.users = {};
        }
        
        // Initialize user data if it doesn't exist
        if (!mutableData.users[interaction.user.id]) {
          mutableData.users[interaction.user.id] = { balance: 0 };
        }
        
        // Get user's current balance
        const userData = mutableData.users[interaction.user.id];
        const currentBalance = userData.balance || 0;
        
        // Check if user has enough balance
        if (currentBalance < totalCost) {
          console.log(`User ${interaction.user.id} has insufficient balance: $${currentBalance} < $${totalCost}`);
          return null; // Abort transaction
        }
        
        // Check if category, item, and enough quantity exist
        const categoryData = mutableData.categories?.[category];
        if (!categoryData) {
          console.log(`Category ${category} not found`);
          return null; // Abort transaction
        }
        
        const itemData = categoryData.items?.[itemId];
        if (!itemData) {
          console.log(`Item ${itemId} not found in category ${category}`);
          return null; // Abort transaction
        }
        
        const currentQuantity = itemData.quantity || 0;
        if (currentQuantity < availableQuantity) {
          console.log(`Not enough quantity: ${currentQuantity} < ${availableQuantity}`);
          return null; // Abort transaction
        }
        
        // Make sure there are enough details
        const detailsData = itemData.details || {};
        const detailsKeys = Object.keys(detailsData);
        if (detailsKeys.length < availableQuantity) {
          console.log(`Not enough details: ${detailsKeys.length} < ${availableQuantity}`);
          return null; // Abort transaction
        }
        
        // Everything looks good, update the data
        // 1. Update user balance
        mutableData.users[interaction.user.id].balance = currentBalance - totalCost;
        
        // 2. Update item quantity
        mutableData.categories[category].items[itemId].quantity = currentQuantity - availableQuantity;
        
        // 3. Remove details we're going to use (we'll copy them first)
        const keysToRemove = detailsKeys.slice(0, availableQuantity);
        keysToRemove.forEach(key => {
          delete mutableData.categories[category].items[itemId].details[key];
        });
        
        // 4. Record the purchase in user's history
        if (!mutableData.users[interaction.user.id].purchases) {
          mutableData.users[interaction.user.id].purchases = {};
        }
        
        const purchaseId = Date.now();
        mutableData.users[interaction.user.id].purchases[purchaseId] = {
          itemName: account.name,
          quantity: availableQuantity,
          price: totalCost,
          category: category,
          timestamp: purchaseId
        };
        
        console.log(`Transaction processed for user ${interaction.user.id}: $${currentBalance} -> $${currentBalance - totalCost}`);
        transactionSuccess = true;
        return mutableData;
      }, (error, committed, snapshot) => {
        // This callback is called once with the result
        if (error) {
          console.error('Transaction error:', error);
          throw new Error(`Transaction failed: ${error.message}`);
        }
        
        if (!committed) {
          console.log('Transaction not committed');
          transactionSuccess = false;
        }
      });
      
      // If we get here, either the transaction failed due to insufficient balance or other issues
      if (!transactionSuccess) {
        const userSnapshot = await userRef.once('value');
        const userData = userSnapshot.val() || {};
        const currentBalance = userData.balance || 0;
        
        return interaction.editReply({ 
          embeds: [soloLevelingEmbed('Purchase Failed', 
            `Either you don't have enough balance ($${currentBalance} available, $${totalCost} required) or the item is no longer available in the requested quantity.`
          )] 
        });
      }
      
      // At this point, transaction was successful, let's get the details to send
      const detailsSnapshot = await client.db.ref(`categories/${category}/items/${itemId}/details`).once('value');
      const detailsData = detailsSnapshot.val() || {};
      const detailsKeys = Object.keys(detailsData);
      
      // Transaction was successful but the details might have changed
      if (detailsKeys.length < availableQuantity) {
        // This situation should be rare due to transaction, but handle it anyway
        // Refund the user through another transaction
        await client.db.ref().transaction((mutableData) => {
          const userData = mutableData?.users?.[interaction.user.id] || {};
          const currentBalance = userData.balance || 0;
          
          if (!mutableData.users) {
            mutableData.users = {};
          }
          if (!mutableData.users[interaction.user.id]) {
            mutableData.users[interaction.user.id] = {};
          }
          
          mutableData.users[interaction.user.id].balance = currentBalance + totalCost;
          
          return mutableData;
        });
        
        await logAction(client, `⚠️ Purchase failed after transaction: ${interaction.user.username} tried to buy ${availableQuantity} ${accountName} accounts but details were not available. Refunded $${totalCost}.`);
        
        return interaction.editReply({ 
          embeds: [soloLevelingEmbed('Error', 
            `Transaction was processed but account details were not available. Your balance has been refunded. Please contact an administrator.`
          )] 
        });
      }
      
      // Create account files and send them to the user
      try {
        // Ensure accounts directory exists
        const accountsDir = path.join(__dirname, '..', 'accounts');
        if (!fs.existsSync(accountsDir)) {
          fs.mkdirSync(accountsDir, { recursive: true });
        }
        
        // Define maximum file sizes and batch thresholds
        const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB to stay safely under Discord's limit
        const LARGE_ORDER_THRESHOLD = 5; // When to switch to batching (changed from 50 to 5)
        
        // Process the accounts differently based on quantity
        if (availableQuantity > LARGE_ORDER_THRESHOLD) {
          // Notify user about order being processed in batches
          await interaction.editReply({ 
            embeds: [soloLevelingEmbed('Processing Order', 
              `Your purchase of ${availableQuantity} accounts is being processed. The accounts will be batched into fewer files for convenience.`
            )] 
          });
          
          // For larger orders, batch accounts into larger files
          const accountBatches = [];
          let currentBatch = [];
          let currentBatchSize = 0;
          let totalBatches = 0;
          const itemsPerBatch = Math.min(500, Math.ceil(availableQuantity / 5)); // Batch size (max 500 accounts per batch)
          
          for (let i = 0; i < availableQuantity; i++) {
            const detailKey = detailsKeys[i];
            const detail = detailsData[detailKey];
            
            currentBatch.push({
              index: i + 1,
              detail: detail
            });
            currentBatchSize += detail.length + 50; // Rough estimate of size including formatting
            
            // When we reach batch size or end of accounts, finalize batch
            if (currentBatch.length >= itemsPerBatch || i === availableQuantity - 1 || currentBatchSize >= MAX_FILE_SIZE) {
              totalBatches++;
              
              // Create a batch file with multiple accounts
              const batchFileName = `${category}_${account.name}_batch${totalBatches}_${Date.now()}.txt`;
              const batchFilePath = path.join(accountsDir, batchFileName);
              
              // Format the batch content with numbered accounts
              let batchContent = `==== BATCH ${totalBatches} - ${currentBatch.length} ACCOUNTS ====\n\n`;
              currentBatch.forEach(item => {
                batchContent += `=== ACCOUNT #${item.index} ===\n${item.detail}\n\n`;
              });
              
              // Write batch to file
              fs.writeFileSync(batchFilePath, batchContent);
              
              // Add file to batches array
              accountBatches.push({
                attachment: batchFilePath,
                name: batchFileName
              });
              
              // Reset for next batch
              currentBatch = [];
              currentBatchSize = 0;
            }
          }
          
          // Send all files in a single message if possible
          await dmChannel.send({
            content: `Here are your purchased **${account.name}** accounts:`,
            files: accountBatches
          });
          
          // Clean up batch files
          for (const file of accountBatches) {
            if (fs.existsSync(file.attachment)) {
              fs.unlinkSync(file.attachment);
            }
          }
          
        } else {
          // Original behavior for small orders (individual files)
          const accountFiles = [];
          
          // Process each account detail
          for (let i = 0; i < availableQuantity; i++) {
            const detailKey = detailsKeys[i];
            const detail = detailsData[detailKey];
            
            const fileName = `${category}_${account.name}_${Date.now()}_${i}.txt`;
            const filePath = path.join(accountsDir, fileName);
            
            // Write account details to file
            fs.writeFileSync(filePath, detail);
            accountFiles.push({ attachment: filePath, name: fileName });
          }
          
          // Send all files in a single message
          await dmChannel.send({ 
            content: `Here are your purchased **${account.name}** accounts:`,
            files: accountFiles 
          });
          
          // Clean up files after sending
          for (const file of accountFiles) {
            if (fs.existsSync(file.attachment)) {
              fs.unlinkSync(file.attachment);
            }
          }
        }
        
        // Get updated user balance
        const updatedUserSnapshot = await userRef.once('value');
        const updatedUserData = updatedUserSnapshot.val() || {};
        const newBalance = updatedUserData.balance || 0;
        
        // Log the purchase
        await logAction(client, `🛒 ${interaction.user.username} purchased ${availableQuantity} ${account.name} accounts from ${category} for $${totalCost}`);
        
        // Reply to the user
        return interaction.editReply({ 
          embeds: [soloLevelingEmbed('Purchase Successful', 
            `You have successfully purchased **${availableQuantity} ${account.name}** accounts for $${totalCost}.\n` +
            `The account details have been sent to your DMs.\n` +
            `New Balance: $${newBalance}`
          )] 
        });
        
      } catch (fileError) {
        console.error('Error creating files:', fileError);
        
        // Attempt to refund the user
        await client.db.ref().transaction((mutableData) => {
          const userData = mutableData?.users?.[interaction.user.id] || {};
          const currentBalance = userData.balance || 0;
          
          if (!mutableData.users) {
            mutableData.users = {};
          }
          if (!mutableData.users[interaction.user.id]) {
            mutableData.users[interaction.user.id] = {};
          }
          
          mutableData.users[interaction.user.id].balance = currentBalance + totalCost;
          
          return mutableData;
        });
        
        await logAction(client, `❌ File creation error for ${interaction.user.username}'s purchase of ${availableQuantity} ${account.name} accounts. Refunded: $${totalCost}`);
        
        return interaction.editReply({ 
          embeds: [soloLevelingEmbed('Error', 
            `An error occurred while creating your account files. Your balance has been refunded. Please contact an administrator.`
          )] 
        });
      }
    } catch (error) {
      console.error('Purchase error:', error);
      await logAction(client, `❌ Error during purchase for ${interaction.user.username}: ${error.message}`);
      
      return interaction.editReply({ 
        embeds: [soloLevelingEmbed('Error', 
          'An error occurred during purchase. Please try again later or contact an administrator.'
        )] 
      });
    }
  }
};
