/**
 * Team roster (team_members).
 * Methods are mixed into DatabaseService (src/db/postgres.js); `this` is the service.
 */
import { warn } from '../../utils/logger.js';
import { recordHandledError } from '../../core/safe.js';
import { safeJsonParse, createOpaqueId } from '../rowMappers.js';

export class TeamRepository {
  async getTeamMembers() {
    try {
      await this.ensureInitialized();
      const res = await this.pool.query('SELECT * FROM team_members ORDER BY display_name ASC');
      if (res.rows.length === 0 && this.inMemoryTeamMembers.length > 0) {
        return [...this.inMemoryTeamMembers];
      }
      return res.rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        email: row.email,
        aliases: typeof row.aliases === 'string' ? safeJsonParse(row.aliases) : row.aliases || [],
        githubUsername: row.github_username,
        jiraEmail: row.jira_email,
        jiraAccountId: row.jira_account_id,
        gcalEmail: row.gcal_email,
        notionName: row.notion_name,
        currentLevel: row.current_level,
        targetLevel: row.target_level,
        track: row.track,
        tenureMonths: row.tenure_months,
        skills: typeof row.skills === 'string' ? safeJsonParse(row.skills) : row.skills || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (err) {
      warn('PostgreSQL getTeamMembers failed, using in-memory fallback', { err: err.message });
      return [...this.inMemoryTeamMembers];
    }
  }

  async getTeamMemberById(id) {
    try {
      await this.ensureInitialized();
      const res = await this.pool.query('SELECT * FROM team_members WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        id: row.id,
        displayName: row.display_name,
        email: row.email,
        aliases: typeof row.aliases === 'string' ? safeJsonParse(row.aliases) : row.aliases || [],
        githubUsername: row.github_username,
        jiraEmail: row.jira_email,
        jiraAccountId: row.jira_account_id,
        gcalEmail: row.gcal_email,
        notionName: row.notion_name,
        currentLevel: row.current_level,
        targetLevel: row.target_level,
        track: row.track,
        tenureMonths: row.tenure_months,
        skills: typeof row.skills === 'string' ? safeJsonParse(row.skills) : row.skills || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (err) {
      return this.inMemoryTeamMembers.find((m) => m.id === id) || null;
    }
  }

  async upsertTeamMember(memberData) {
    const id = memberData.id || createOpaqueId('mem');
    const displayName = memberData.displayName || memberData.display_name || 'Team Member';
    const email = memberData.email || null; // '' would collide on the UNIQUE email column
    const aliases = JSON.stringify(memberData.aliases || [displayName]);
    const githubUsername = memberData.githubUsername || memberData.github_username || null;
    const jiraEmail = memberData.jiraEmail || memberData.jira_email || (email || null);
    const jiraAccountId = memberData.jiraAccountId || memberData.jira_account_id || null;
    const gcalEmail = memberData.gcalEmail || memberData.gcal_email || (email || null);
    const notionName = memberData.notionName || memberData.notion_name || displayName;
    // Unknown until the owner enters them; never assumed. A sync with no value keeps the stored one.
    const currentLevel = memberData.currentLevel || memberData.current_level || null;
    const targetLevel = memberData.targetLevel || memberData.target_level || null;
    const track = memberData.track || null;
    const rawTenure = memberData.tenureMonths ?? memberData.tenure_months;
    const tenureMonths = rawTenure === null || rawTenure === undefined || rawTenure === '' || !Number.isFinite(Number(rawTenure)) ? null : Number(rawTenure);
    const skills = memberData.skills ? JSON.stringify(memberData.skills) : null;

    try {
      await this.ensureInitialized();
      const res = await this.pool.query(
        `
        INSERT INTO team_members (
          id, display_name, email, aliases, github_username, jira_email,
          jira_account_id, gcal_email, notion_name, current_level, target_level,
          track, tenure_months, skills, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
        ON CONFLICT (id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          email = COALESCE(EXCLUDED.email, team_members.email),
          aliases = EXCLUDED.aliases,
          github_username = COALESCE(EXCLUDED.github_username, team_members.github_username),
          jira_email = COALESCE(EXCLUDED.jira_email, team_members.jira_email),
          jira_account_id = COALESCE(EXCLUDED.jira_account_id, team_members.jira_account_id),
          gcal_email = COALESCE(EXCLUDED.gcal_email, team_members.gcal_email),
          notion_name = COALESCE(EXCLUDED.notion_name, team_members.notion_name),
          current_level = COALESCE(EXCLUDED.current_level, team_members.current_level),
          target_level = COALESCE(EXCLUDED.target_level, team_members.target_level),
          track = COALESCE(EXCLUDED.track, team_members.track),
          tenure_months = COALESCE(EXCLUDED.tenure_months, team_members.tenure_months),
          skills = COALESCE(EXCLUDED.skills, team_members.skills),
          updated_at = NOW()
        RETURNING *;
        `,
        [
          id, displayName, email, aliases, githubUsername, jiraEmail,
          jiraAccountId, gcalEmail, notionName, currentLevel, targetLevel,
          track || 'INDIVIDUAL_CONTRIBUTOR', tenureMonths, skills ?? '{}'
        ]
      );
      const row = res.rows[0];
      const member = {
        id: row.id,
        displayName: row.display_name,
        email: row.email,
        aliases: typeof row.aliases === 'string' ? safeJsonParse(row.aliases) : row.aliases || [],
        githubUsername: row.github_username,
        jiraEmail: row.jira_email,
        jiraAccountId: row.jira_account_id,
        gcalEmail: row.gcal_email,
        notionName: row.notion_name,
        currentLevel: row.current_level,
        targetLevel: row.target_level,
        track: row.track,
        tenureMonths: row.tenure_months,
        skills: typeof row.skills === 'string' ? safeJsonParse(row.skills) : row.skills || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      // Keep in-memory in sync
      const idx = this.inMemoryTeamMembers.findIndex((m) => m.id === id);
      if (idx >= 0) this.inMemoryTeamMembers[idx] = member;
      else this.inMemoryTeamMembers.push(member);
      return member;
    } catch (err) {
      warn('PostgreSQL upsertTeamMember failed, saving to in-memory fallback', { err: err.message });
      const member = {
        id, displayName, email, aliases: safeJsonParse(aliases),
        githubUsername, jiraEmail, jiraAccountId, gcalEmail,
        notionName, currentLevel, targetLevel, track,
        tenureMonths, skills: skills ? safeJsonParse(skills) : {},
        updatedAt: new Date().toISOString(),
      };
      const idx = this.inMemoryTeamMembers.findIndex((m) => m.id === id);
      if (idx >= 0) this.inMemoryTeamMembers[idx] = member;
      else this.inMemoryTeamMembers.push(member);
      return member;
    }
  }

  async deleteTeamMember(id) {
    try {
      await this.ensureInitialized();
      await this.pool.query('DELETE FROM team_members WHERE id = $1', [id]);
      this.inMemoryTeamMembers = this.inMemoryTeamMembers.filter((m) => m.id !== id);
      return true;
    } catch (err) {
      recordHandledError('db.postgres.deleteTeamMember', err);
      this.inMemoryTeamMembers = this.inMemoryTeamMembers.filter((m) => m.id !== id);
      return true;
    }
  }

  async purgeMockTeamMembers() {
    try {
      await this.ensureInitialized();
      await this.pool.query("DELETE FROM team_members WHERE email LIKE '%@company.internal' OR email LIKE '%@testcompany.com' OR email LIKE '%.internal' OR id IN ('mem_alex', 'mem_sarah', 'mem_taylor', 'mem_elena', 'mem_marcus', 'mem_lead', 'mem_admin_lead')");
      this.inMemoryTeamMembers = this.inMemoryTeamMembers.filter(
        (m) => !m.email?.endsWith('@company.internal') && !m.email?.endsWith('@testcompany.com') && !m.email?.endsWith('.internal') && !['mem_alex', 'mem_sarah', 'mem_taylor', 'mem_elena', 'mem_marcus', 'mem_lead', 'mem_admin_lead'].includes(m.id)
      );
      return true;
    } catch (err) {
      this.inMemoryTeamMembers = this.inMemoryTeamMembers.filter(
        (m) => !m.email?.endsWith('@company.internal') && !m.email?.endsWith('@testcompany.com') && !m.email?.endsWith('.internal') && !['mem_alex', 'mem_sarah', 'mem_taylor', 'mem_elena', 'mem_marcus', 'mem_lead', 'mem_admin_lead'].includes(m.id)
      );
      return true;
    }
  }
}
