const { Client } = require('@notionhq/client');
require('dotenv').config();

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;

/**
 * Fetch Notion pages linked to ongoing projects.
 * Returns array of { id, title, last_edited_time, url }
 */
async function fetchProjectPages() {
  try {
    const response = await notion.databases.query({
      database_id: databaseId,
      sorts: [{ property: 'Last Edited', direction: 'descending' }],
      page_size: 20
    });
    return response.results.map(page => ({
      id: page.id,
      title: page.properties.Name?.title?.[0]?.plain_text || 'Untitled',
      last_edited_time: page.last_edited_time,
      url: page.url
    }));
  } catch (error) {
    console.error('Error fetching Notion project pages:', error.message);
    return [];
  }
}

/**
 * Summarize new comments or updates on a Notion page.
 * Returns the latest 3 comments (if any).
 */
async function summarizePageUpdates(pageId) {
  try {
    const response = await notion.comments.list({ block_id: pageId });
    const comments = response.results.slice(-3).map(c => c.rich_text.map(rt => rt.plain_text).join(' '));
    return comments.length ? comments : ['No recent comments.'];
  } catch (error) {
    console.error('Error summarizing Notion page updates:', error.message);
    return ['Unable to fetch comments.'];
  }
}

/**
 * Update a Notion page with a status note/tag (adds a comment).
 */
async function updatePageStatus(pageId, note) {
  try {
    await notion.comments.create({
      parent: { block_id: pageId },
      rich_text: [{ type: 'text', text: { content: note } }]
    });
    return true;
  } catch (error) {
    console.error(`Error updating Notion page ${pageId}:`, error.message);
    return false;
  }
}

module.exports = { fetchProjectPages, summarizePageUpdates, updatePageStatus };
