import axios from 'axios';
import databaseService from '../db/postgres.js';
import settingsService from './settingsService.js';
import { info, warn, error } from '../utils/logger.js';

class IdentityService {
  constructor() {
    this.cachedMembers = [];
    this.lastSyncedAt = null;
  }

  /**
   * Resolve an engineer by name, alias, GitHub handle, or email.
   */
  async resolveMember(query) {
    if (!query || typeof query !== 'string') return null;
    const cleanQuery = query.trim().toLowerCase();

    const members = await this.getAllMembers();
    if (members.length === 0) return null;

    // 1. Exact matches
    let match = members.find((m) =>
      m.displayName?.toLowerCase() === cleanQuery ||
      m.id?.toLowerCase() === cleanQuery ||
      m.email?.toLowerCase() === cleanQuery ||
      m.githubUsername?.toLowerCase() === cleanQuery ||
      m.githubUsername?.toLowerCase() === cleanQuery.replace(/^@/, '') ||
      m.jiraEmail?.toLowerCase() === cleanQuery ||
      m.gcalEmail?.toLowerCase() === cleanQuery ||
      (m.aliases && m.aliases.some((a) => a.toLowerCase() === cleanQuery || a.toLowerCase() === cleanQuery.replace(/^@/, '')))
    );

    if (match) return match;

    // 2. Partial / Substring / First Name matches
    match = members.find((m) =>
      m.displayName?.toLowerCase().includes(cleanQuery) ||
      cleanQuery.includes(m.displayName?.toLowerCase().split(' ')[0] || '___') ||
      (m.githubUsername && cleanQuery.includes(m.githubUsername.toLowerCase())) ||
      (m.aliases && m.aliases.some((a) => a.toLowerCase().includes(cleanQuery) || cleanQuery.includes(a.toLowerCase())))
    );

    return match || null;
  }

  /**
   * Extracts member mentions from natural language query and resolves handles.
   * e.g. "Review Alex's PRs" -> resolves Alex -> { github: 'alex-dev99', jira: 'alex.williams@...', ... }
   */
  async resolveMemberFromText(text) {
    if (!text || typeof text !== 'string') return null;
    const members = await this.getAllMembers();
    if (!members || members.length === 0) return null;

    const tokens = text.replace(/['".,?!;:]/g, ' ').split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      if (['the', 'and', 'for', 'with', 'our', 'team', 'check', 'show', 'review', 'calculate'].includes(token.toLowerCase())) {
        continue;
      }
      const match = await this.resolveMember(token);
      if (match) {
        return match;
      }
    }
    return null;
  }

  /**
   * Fetches the exact username / handle for a given tool from DB.
   * @param {string} query - Name, alias, email, or NLP phrase
   * @param {'github' | 'jira' | 'notion' | 'gcal'} toolName
   * @returns {Promise<string | null>}
   */
  async getToolUsernameForMember(query, toolName) {
    const member = (await this.resolveMember(query)) || (await this.resolveMemberFromText(query));
    if (!member) return null;

    switch (toolName) {
      case 'github':
        return member.githubUsername || member.displayName?.split(' ')[0] || null;
      case 'jira':
        return member.jiraAccountId || member.jiraEmail || member.email || null;
      case 'notion':
        return member.notionName || member.displayName || null;
      case 'gcal':
        return member.gcalEmail || member.email || null;
      default:
        return member.displayName || null;
    }
  }

  /**
   * Retrieves default Engineering Manager / Lead profile from DB.
   */
  async getDefaultManagerOrAdmin() {
    const members = await this.getAllMembers();
    if (!members || members.length === 0) return null;
    return members.find((m) => m.track === 'ENGINEERING_MANAGEMENT' || m.currentLevel?.startsWith('M') || m.currentLevel?.includes('STAFF')) || members[0];
  }

  async getAllMembers() {
    try {
      const members = await databaseService.getTeamMembers();
      this.cachedMembers = members;
      return members;
    } catch (err) {
      warn('Failed to load team members from database', { err: err.message });
      return this.cachedMembers;
    }
  }

  async getTeamMembers() {
    return this.getAllMembers();
  }

  /**
   * 1-Click Auto-Discovery & Cross-Source Reconciliation
   */
  async autoDiscoverAndSync(options = {}) {
    await settingsService.initialize();
    const rawSettings = settingsService.cachedRawSettings;
    const discovered = new Map(); // Key: normalized email, gh, or name

    const addOrMerge = (entry) => {
      const emailKey = entry.email ? entry.email.toLowerCase().trim() : null;
      const ghKey = entry.githubUsername ? entry.githubUsername.toLowerCase().trim() : null;
      const nameKey = entry.displayName ? entry.displayName.toLowerCase().trim() : null;

      // Find existing match by email, GitHub username, or display name
      let foundKey = null;
      for (const [key, existing] of discovered.entries()) {
        if (emailKey && existing.email && existing.email.toLowerCase().trim() === emailKey) {
          foundKey = key;
          break;
        }
        if (ghKey && existing.githubUsername && existing.githubUsername.toLowerCase().trim() === ghKey) {
          foundKey = key;
          break;
        }
        if (nameKey && existing.displayName && existing.displayName.toLowerCase().trim() === nameKey) {
          foundKey = key;
          break;
        }
      }

      if (foundKey) {
        const existing = discovered.get(foundKey);
        const isBetterName = entry.displayName && entry.displayName.includes(' ') && (!existing.displayName || !existing.displayName.includes(' '));
        discovered.set(foundKey, {
          ...existing,
          displayName: isBetterName ? entry.displayName : (existing.displayName || entry.displayName),
          email: existing.email || entry.email,
          githubUsername: existing.githubUsername || entry.githubUsername,
          jiraEmail: existing.jiraEmail || entry.jiraEmail,
          jiraAccountId: existing.jiraAccountId || entry.jiraAccountId,
          gcalEmail: existing.gcalEmail || entry.gcalEmail,
          notionName: existing.notionName || entry.notionName,
          track: entry.track || existing.track || 'INDIVIDUAL_CONTRIBUTOR',
          currentLevel: entry.currentLevel || existing.currentLevel || 'L4_MID',
          targetLevel: entry.targetLevel || existing.targetLevel || 'L5_SENIOR',
          aliases: Array.from(new Set([...(existing.aliases || []), ...(entry.aliases || [])])),
        });
      } else {
        const primaryKey = emailKey || ghKey || nameKey;
        if (primaryKey) {
          discovered.set(primaryKey, entry);
        }
      }
    };

    // 0. Purge legacy mock/dummy fixtures before reconciling real identities
    await databaseService.purgeMockTeamMembers().catch(() => {});

    // 0. Primary Administrator & Lead Profile Auto-Resolution
    const isDummyEmail = (email) => {
      if (!email || typeof email !== 'string') return true;
      const lower = email.toLowerCase().trim();
      return (
        lower.includes('placeholder') ||
        lower.includes('testcompany.com') ||
        lower.includes('example.com') ||
        lower === 'lead@testcompany.com' ||
        lower === 'alex@company.com' ||
        lower.endsWith('@company.internal')
      );
    };

    const isDummyOwner = (owner) => {
      if (!owner || typeof owner !== 'string') return true;
      const lower = owner.toLowerCase().trim();
      return lower.includes('placeholder') || lower === 'owner' || lower === 'mock' || lower === 'org' || lower === 'myorg';
    };

    const rawGcal = rawSettings.mcp?.googleCalendar?.calendarId || process.env.GOOGLE_CALENDAR_ID;
    const rawJiraEmail = rawSettings.mcp?.jira?.email || process.env.JIRA_USER_EMAIL;
    const rawGhOwner = process.env.GITHUB_OWNER || rawSettings.mcp?.github?.owner;

    const primaryGcal = (rawGcal && rawGcal.includes('@') && !isDummyEmail(rawGcal)) ? rawGcal : null;
    const primaryJiraEmail = (rawJiraEmail && rawJiraEmail.includes('@') && !isDummyEmail(rawJiraEmail)) ? rawJiraEmail : null;
    const primaryGhOwner = (rawGhOwner && !isDummyOwner(rawGhOwner)) ? rawGhOwner : null;

    const primaryEmail = primaryGcal || primaryJiraEmail || ((process.env.PRIMARY_ADMIN_EMAIL && !isDummyEmail(process.env.PRIMARY_ADMIN_EMAIL)) ? process.env.PRIMARY_ADMIN_EMAIL : '');
    const primaryAdminName = process.env.PRIMARY_ADMIN_NAME || process.env.EM_LEAD_NAME || (primaryEmail ? primaryEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : (primaryGhOwner || ''));
    const primaryJiraAccountId = process.env.JIRA_ACCOUNT_ID || rawSettings.mcp?.jira?.accountId || '';

    if (primaryEmail || primaryGhOwner) {
      const aliasSet = new Set([
        primaryAdminName,
        primaryAdminName.split(' ')[0],
        primaryGhOwner,
        primaryGhOwner ? `@${primaryGhOwner}` : null,
        primaryEmail,
        primaryEmail ? primaryEmail.split('@')[0] : null,
      ].filter(Boolean));

      addOrMerge({
        id: `mem_${(primaryEmail || primaryGhOwner).split('@')[0].replace(/[^a-z0-9]/gi, '_')}`,
        displayName: primaryAdminName,
        email: primaryEmail || '',
        githubUsername: primaryGhOwner || '',
        jiraEmail: primaryJiraEmail || primaryEmail || '',
        jiraAccountId: primaryJiraAccountId,
        gcalEmail: primaryGcal || primaryEmail || '',
        notionName: primaryAdminName,
        currentLevel: 'M1_EM',
        targetLevel: 'M2_DIR',
        track: 'ENGINEERING_MANAGEMENT',
        tenureMonths: 24,
        aliases: Array.from(aliasSet),
      });
    }

    // 1. Harvest from GitHub
    if (rawSettings.mcp?.github?.token || process.env.GITHUB_TOKEN) {
      try {
        const token = (rawSettings.mcp?.github?.token || process.env.GITHUB_TOKEN || '').trim();
        const owner = rawSettings.mcp?.github?.owner || process.env.GITHUB_OWNER || '';
        const repo = rawSettings.mcp?.github?.repo || process.env.GITHUB_REPO || '';
        const authHeader = token.startsWith('Bearer ') || token.startsWith('token ') ? token : `Bearer ${token}`;

        // Try /user (authenticated profile)
        const userRes = await axios.get('https://api.github.com/user', {
          headers: { Authorization: authHeader, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'EM-TaskFlow-AI' },
          timeout: 4500,
        }).catch(() => null);

        if (userRes?.data?.login) {
          addOrMerge({
            id: `mem_gh_${userRes.data.login.toLowerCase()}`,
            displayName: userRes.data.name || userRes.data.login,
            email: userRes.data.email || primaryEmail,
            githubUsername: userRes.data.login,
            aliases: [userRes.data.name, userRes.data.login, `@${userRes.data.login}`].filter(Boolean),
          });
        }

        if (owner && repo) {
          // Fetch contributors
          const contribRes = await axios.get(`https://api.github.com/repos/${owner}/${repo}/contributors?per_page=30`, {
            headers: { Authorization: authHeader, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'EM-TaskFlow-AI' },
            timeout: 4500,
          }).catch(() => ({ data: [] }));

          for (const c of (contribRes.data || [])) {
            if (c.login && !c.login.includes('[bot]')) {
              addOrMerge({
                id: `mem_gh_${c.login.toLowerCase()}`,
                displayName: c.login,
                githubUsername: c.login,
                aliases: [c.login, `@${c.login}`],
              });
            }
          }

          // Fetch recent commit authors for real names & emails
          const commitRes = await axios.get(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=30`, {
            headers: { Authorization: authHeader, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'EM-TaskFlow-AI' },
            timeout: 4500,
          }).catch(() => ({ data: [] }));

          for (const item of (commitRes.data || [])) {
            const author = item.commit?.author;
            const ghLogin = item.author?.login;
            if (author?.email && !author.email.includes('noreply.github.com')) {
              addOrMerge({
                id: `mem_${author.email.split('@')[0].replace(/[^a-z0-9]/gi, '_')}`,
                displayName: author.name || ghLogin || 'Engineer',
                email: author.email,
                githubUsername: ghLogin || null,
                aliases: [author.name, ghLogin, author.email.split('@')[0]].filter(Boolean),
              });
            }
          }
        }
      } catch (err) {
        warn('GitHub auto-discovery encountered an error', { err: err.message });
      }
    }

    // 2. Harvest from Jira
    const jiraUrl = (rawSettings.mcp?.jira?.url || process.env.JIRA_BASE_URL || '').replace(/\/$/, '');
    const jiraToken = rawSettings.mcp?.jira?.apiToken || process.env.JIRA_API_TOKEN || '';
    const jiraEmail = rawSettings.mcp?.jira?.email || process.env.JIRA_USER_EMAIL || '';

    if (jiraUrl && jiraUrl.includes('http')) {
      try {
        const authHeader = jiraEmail && jiraToken && !jiraToken.startsWith('Basic ')
          ? `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64')}`
          : (jiraToken.startsWith('Basic ') || jiraToken.startsWith('Bearer ') ? jiraToken : `Bearer ${jiraToken}`);

        const headers = { Authorization: authHeader, Accept: 'application/json' };

        // Try /rest/api/3/myself
        const myselfRes = await axios.get(`${jiraUrl}/rest/api/3/myself`, { headers, timeout: 4500 }).catch(() => null);
        if (myselfRes?.data?.accountId) {
          const u = myselfRes.data;
          addOrMerge({
            id: `mem_jira_${u.accountId.replace(/[^a-z0-9]/gi, '_')}`,
            displayName: u.displayName || primaryAdminName,
            email: u.emailAddress || primaryJiraEmail || primaryEmail,
            jiraEmail: u.emailAddress || primaryJiraEmail || primaryEmail,
            jiraAccountId: u.accountId,
            aliases: [u.displayName, u.emailAddress].filter(Boolean),
          });
        }

        // Get searchable assignees
        const userRes = await axios.get(`${jiraUrl}/rest/api/3/users/search?query=%20&maxResults=50`, {
          headers,
          timeout: 4500,
        }).catch(() => ({ data: [] }));

        for (const u of (userRes.data || [])) {
          if (u.accountType === 'atlassian' && u.emailAddress) {
            addOrMerge({
              id: `mem_jira_${u.accountId || u.emailAddress.split('@')[0]}`,
              displayName: u.displayName || u.emailAddress.split('@')[0],
              email: u.emailAddress,
              jiraEmail: u.emailAddress,
              jiraAccountId: u.accountId,
              aliases: [u.displayName, u.emailAddress.split('@')[0]].filter(Boolean),
            });
          }
        }
      } catch (err) {
        warn('Jira auto-discovery encountered an error', { err: err.message });
      }
    }

    // 3. Harvest from Google Calendar
    const gcalApiKey = rawSettings.mcp?.googleCalendar?.apiKey || process.env.GOOGLE_CALENDAR_API_KEY || '';
    const gcalId = rawSettings.mcp?.googleCalendar?.calendarId || process.env.GOOGLE_CALENDAR_ID || 'primary';
    if (gcalApiKey && !gcalApiKey.includes('placeholder')) {
      try {
        const isOAuth = gcalApiKey.startsWith('ya29.') || gcalApiKey.startsWith('Bearer ') || gcalApiKey.length > 80;
        const headers = isOAuth ? { Authorization: gcalApiKey.startsWith('Bearer ') ? gcalApiKey : `Bearer ${gcalApiKey}` } : {};
        const reqParams = {
          maxResults: 50,
          singleEvents: true,
          orderBy: 'startTime',
          timeMin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          timeMax: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          ...(isOAuth ? {} : { key: gcalApiKey }),
        };

        const res = await axios.get(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(gcalId)}/events`,
          { params: reqParams, headers, timeout: 4500 }
        ).catch(() => ({ data: { items: [] } }));

        for (const evt of (res.data?.items || [])) {
          if (Array.isArray(evt.attendees)) {
            for (const att of evt.attendees) {
              if (att.email && !att.email.includes('calendar.google.com') && !att.resource) {
                addOrMerge({
                  id: `mem_gcal_${att.email.split('@')[0].replace(/[^a-z0-9]/gi, '_')}`,
                  displayName: att.displayName || att.email.split('@')[0],
                  email: att.email,
                  gcalEmail: att.email,
                  aliases: [att.displayName, att.email].filter(Boolean),
                });
              }
            }
          }
        }
      } catch (err) {
        warn('Google Calendar auto-discovery encountered an error', { err: err.message });
      }
    }

    // 4. Harvest from Slack
    const slackBotToken = rawSettings.mcp?.slack?.botToken || process.env.SLACK_BOT_TOKEN || '';
    if (slackBotToken && !slackBotToken.includes('placeholder')) {
      try {
        const slackRes = await axios.get('https://slack.com/api/users.list', {
          headers: { Authorization: `Bearer ${slackBotToken}` },
          timeout: 4500,
        }).catch(() => ({ data: { members: [] } }));

        for (const su of (slackRes.data?.members || [])) {
          if (!su.is_bot && !su.deleted && su.profile?.email) {
            addOrMerge({
              id: `mem_slack_${su.id}`,
              displayName: su.profile.real_name || su.real_name || su.name,
              email: su.profile.email,
              aliases: [su.real_name, su.name, su.profile.display_name, su.profile.email].filter(Boolean),
            });
          }
        }
      } catch (err) {
        warn('Slack auto-discovery encountered an error', { err: err.message });
      }
    }

    // 5. Harvest from Notion
    if (rawSettings.mcp?.notion?.apiKey || process.env.NOTION_API_KEY) {
      try {
        const apiKey = (rawSettings.mcp?.notion?.apiKey || process.env.NOTION_API_KEY || '').trim();
        const notionRes = await axios.get('https://api.notion.com/v1/users', {
          headers: { Authorization: `Bearer ${apiKey}`, 'Notion-Version': '2022-06-28' },
          timeout: 4500,
        }).catch(() => ({ data: { results: [] } }));

        for (const nu of (notionRes.data?.results || [])) {
          if (nu.type === 'person' && nu.person?.email) {
            addOrMerge({
              id: `mem_notion_${nu.id.slice(0, 8)}`,
              displayName: nu.name || nu.person.email.split('@')[0],
              email: nu.person.email,
              notionName: nu.name,
              aliases: [nu.name, nu.person.email.split('@')[0]].filter(Boolean),
            });
          }
        }
      } catch (err) {
        warn('Notion auto-discovery encountered an error', { err: err.message });
      }
    }

    // In test suites only when explicitly requested via options, supply sample fixtures
    if (options.seedFixtures) {
      addOrMerge({
        id: 'mem_alex',
        displayName: 'Alex Williams',
        email: 'alex.williams@company.internal',
        aliases: ['Alex', 'alexw', 'eng_alex', 'alex-dev99'],
        githubUsername: 'alex-dev99',
        jiraEmail: 'alex.williams@company.internal',
        gcalEmail: 'alex.williams@company.internal',
        notionName: 'Alex Williams',
        currentLevel: 'L4_MID',
        targetLevel: 'L5_SENIOR',
        track: 'INDIVIDUAL_CONTRIBUTOR',
      });
      addOrMerge({
        id: 'mem_sarah',
        displayName: 'Sarah Chen',
        email: 'sarah.chen@company.internal',
        aliases: ['Sarah', 'sarahc', 'eng_sarah', 'sarah-c'],
        githubUsername: 'sarah-c',
        jiraEmail: 'sarah.chen@company.internal',
        gcalEmail: 'sarah.chen@company.internal',
        notionName: 'Sarah Chen',
        currentLevel: 'L5_SENIOR',
        targetLevel: 'M1_EM',
        track: 'ENGINEERING_MANAGEMENT',
      });
      addOrMerge({
        id: 'mem_taylor',
        displayName: 'Taylor Morgan',
        email: 'taylor.morgan@company.internal',
        aliases: ['Taylor', 'taylorm', 'eng_taylor', 'taylor-dev'],
        githubUsername: 'taylor-dev',
        jiraEmail: 'taylor.morgan@company.internal',
        gcalEmail: 'taylor.morgan@company.internal',
        notionName: 'Taylor Morgan',
        currentLevel: 'L6_STAFF',
        targetLevel: 'L7_PRINCIPAL',
        track: 'INDIVIDUAL_CONTRIBUTOR',
      });
    }

    // Upsert all discovered members into PostgreSQL
    const savedMembers = [];
    for (const [_, entry] of discovered) {
      const saved = await databaseService.upsertTeamMember({
        ...entry,
        currentLevel: entry.currentLevel || 'L4_MID',
        targetLevel: entry.targetLevel || 'L5_SENIOR',
        track: entry.track || 'INDIVIDUAL_CONTRIBUTOR',
        tenureMonths: entry.tenureMonths || 18,
      });
      savedMembers.push(saved);
    }

    this.cachedMembers = savedMembers;
    this.lastSyncedAt = new Date().toISOString();
    info(`✅ Auto-discovered and synchronized ${savedMembers.length} team member(s) into database`);

    return {
      syncedCount: savedMembers.length,
      syncedAt: this.lastSyncedAt,
      members: savedMembers,
    };
  }
}

const identityService = new IdentityService();
export default identityService;
