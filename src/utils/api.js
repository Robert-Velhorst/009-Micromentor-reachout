/**
 * API Service
 * 
 * This legacy module provides API services for the old prototype screens.
 * It delegates operational state to the MARO ledger API.
 */

import resourceOptimizer from './resourceOptimizer';

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with ${response.status}`);
  }
  return data;
}

// Compatibility API methods for the legacy prototype screens.
// The production MARO command center uses client/src/lib/ledgerApi.ts.
const api = {
  // Session management
  session: {
    // Start a stored ledger resource session for a campaign.
    start: async (campaignId) => {
      if (!campaignId) throw new Error('campaignId is required to start a resource session');
      return requestJson('/api/resource-sessions', {
        method: 'POST',
        body: JSON.stringify({ campaignId }),
      });
    },
    
    // End a stored ledger resource session and generate a billing record.
    end: async (sessionId) => {
      if (!sessionId) throw new Error('sessionId is required to end a resource session');
      return requestJson(`/api/resource-sessions/${sessionId}/end`, {
        method: 'POST',
      });
    },
    
    // Get stored campaign usage and invoice-report status.
    getStatus: async (campaignId) => {
      if (!campaignId) throw new Error('campaignId is required to read usage status');
      return requestJson(`/api/campaigns/${campaignId}/usage-report`);
    }
  },
  
  // Mentor management
  mentors: {
    // Get list of mentors with pagination and optimization
    getList: resourceOptimizer.memoize(async (page = 0, limit = 20) => {
      return requestJson(`/api/mentors?page=${page}&limit=${limit}`);
    }),
    
    // Add a new mentor
    add: async (mentorData) => {
      // Clear cache when adding new mentor
      resourceOptimizer.clearMemoizationCache();
      
      return requestJson('/api/mentors', {
        method: 'POST',
        body: JSON.stringify(mentorData)
      });
    },
    
    // Update mentor information
    update: async (mentorId, mentorData) => {
      // Clear cache when updating mentor
      resourceOptimizer.clearMemoizationCache();
      
      return requestJson(`/api/mentors/${mentorId}`, {
        method: 'PATCH',
        body: JSON.stringify(mentorData)
      });
    },
    
    // Delete a mentor
    delete: async (mentorId) => {
      throw new Error(`Deleting mentor ${mentorId} is not supported by MARO. Resolve duplicates or close the mentor instead.`);
    }
  },
  
  // Message management
  messages: {
    // Create a new message with resource optimization
    create: async (messageData) => {
      // Optimize any images in the message
      if (messageData.image) {
        messageData.image = await resourceOptimizer.optimizeImage(messageData.image, {
          maxWidth: 800,
          maxHeight: 600,
          quality: 0.85
        });
      }
      
      // Compress message data
      const compressedData = resourceOptimizer.compressData(messageData);
      
      return requestJson('/api/messages', {
        method: 'POST',
        body: compressedData
      });
    },
    
    // Confirm one manually delivered message with evidence.
    send: async (messageId, deliveryEvidence) => {
      if (!deliveryEvidence || !String(deliveryEvidence).trim()) {
        throw new Error('Manual delivery evidence is required before marking a message sent');
      }
      return requestJson(`/api/messages/${messageId}/send-attempt`, {
        method: 'POST',
        body: JSON.stringify({ channel: 'manual', deliveryEvidence }),
      });
    },
    
    // Get message history with progressive loading
    getHistory: () => {
      const loader = resourceOptimizer.progressiveLoad(async (page, limit) => {
        return requestJson(`/api/messages?page=${page}&limit=${limit}`);
      }, 20);
      
      return loader;
    }
  },
  
  // Billing and usage reporting
  billing: {
    // Get billing history
    getHistory: async (campaignId = null) => {
      return requestJson(campaignId ? `/api/billing?campaignId=${campaignId}` : '/api/billing');
    },
    
    // Generate invoice
    generateInvoice: async (campaignId) => {
      if (!campaignId) throw new Error('campaignId is required to generate an invoice report');
      return requestJson(`/api/campaigns/${campaignId}/invoices`, {
        method: 'POST',
      });
    },
    
    // Send usage report via email
    sendUsageReport: async (email, sessionId = null) => {
      throw new Error(`Email usage reports are not supported by the local ledger. Export a workspace backup or invoice report instead. Requested email: ${email || 'none'}, session: ${sessionId || 'none'}`);
    }
  }
};

export default api;
