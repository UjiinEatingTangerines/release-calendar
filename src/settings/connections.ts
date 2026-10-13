import { stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { defaultConfigPath, readConfig, projectSchema, secret, type Project } from '../config.js';
import { AppError } from '../core/model.js';
import { editableProjectSchema, type ConnectionInput } from '../core/connection-model.js';
import { ConnectionStore, legacyCredentials, type ConnectionDocument } from './store.js';
import { demoProject } from '../demo.js';
import { probeConnections, type Probe } from './probe.js';

const names = (p: Project) => [p.jira.emailEnv, p.jira.tokenEnv, p.github.tokenEnv];
export class Connections {
  private constructor(readonly store: ConnectionStore, private document: ConnectionDocument, private demoOverride: boolean) {}
  static async open(options: { readonly config?: string | undefined; readonly settingsPath?: string | undefined; readonly demo?: boolean | undefined }) {
    const config = options.config ?? defaultConfigPath();
    const store = new ConnectionStore(options.settingsPath ?? (config === defaultConfigPath() ? join(dirname(config), 'connections.json') : `${config}.connections.json`));
    const empty: ConnectionDocument = { version: 1, revision: 'initial', projects: [], credentials: {} };
    if (options.demo) return new Connections(store, empty, true);
    const stored = await store.read();
    if (stored) return new Connections(store, stored, false);
    try { await stat(config); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT' && !options.config) return new Connections(store, empty, false);
      if (error instanceof Error) throw new AppError('CONFIG_INVALID_OR_UNREADABLE'); throw error;
    }
    const { projects } = await readConfig(config);
    const credentials = await legacyCredentials(join(dirname(config), 'credentials.json'), projects.flatMap(names));
    return new Connections(store, { ...empty, projects, credentials }, false);
  }
  get demo() { return this.demoOverride || !this.document.projects.length; }
  get config() { return { projects: this.demo ? [demoProject] : this.document.projects }; }
  resolveSecret = (name: string) => this.document.credentials[name] ?? secret(name);
  async reload(forSettings = false) {
    if (this.demoOverride && !forSettings) return;
    const next = await this.store.read(); if (next) this.document = next;
  }
  async view() {
    await this.reload(true);
    const available = (name: string) => Boolean(this.document.credentials[name] || process.env[name]);
    return { revision: this.document.revision, projects: this.document.projects.map((project) => ({
      project: editableProjectSchema.parse(project), saved: { jiraEmail: available(project.jira.emailEnv), jiraToken: available(project.jira.tokenEnv), githubToken: available(project.github.tokenEnv) },
    })) };
  }
  private prepare(input: ConnectionInput, current: ConnectionDocument) {
    if (current.revision !== input.revision) throw new AppError('SETTINGS_CHANGED_RELOAD');
    const previous = current.projects.find((p) => p.id === input.originalId);
    if (input.originalId && (!previous || previous.id !== input.project.id)) throw new AppError('CONNECTION_NOT_FOUND');
    if (!input.originalId && current.projects.some((p) => p.id === input.project.id)) throw new AppError('CONNECTION_ALREADY_EXISTS');
    const suffix = createHash('sha256').update(input.project.id).digest('hex').slice(0, 16).toUpperCase();
    const prefix = `RC_${suffix}`;
    // Use private per-connection names on edits too: legacy projects may share env keys.
    const project = projectSchema.parse({ ...input.project,
      jira: { ...input.project.jira, emailEnv: `${prefix}_JIRA_EMAIL`, tokenEnv: `${prefix}_JIRA_TOKEN` },
      github: { ...input.project.github, tokenEnv: `${prefix}_GITHUB_TOKEN` },
    });
    const sourceChanged = previous && (previous.jira.site.replace(/\/$/, '') !== project.jira.site.replace(/\/$/, '') || previous.jira.cloudId !== project.jira.cloudId);
    if (sourceChanged && !project.jira.oauthGrant && (!input.credentials.jiraEmail || !input.credentials.jiraToken)) throw new AppError('NEW_JIRA_CREDENTIALS_REQUIRED');
    const prior = (name: string | undefined) => name ? current.credentials[name] ?? process.env[name] : undefined;
    const credentials = { ...current.credentials };
    const values = [input.credentials.jiraEmail ?? prior(previous?.jira.emailEnv), input.credentials.jiraToken ?? prior(previous?.jira.tokenEnv), input.credentials.githubToken ?? prior(previous?.github.tokenEnv)];
    names(project).forEach((name, index) => { const value = values[index]; if (value) credentials[name] = value; });
    if (!project.jira.oauthGrant && (!credentials[project.jira.emailEnv] || !credentials[project.jira.tokenEnv])) throw new AppError('CREDENTIAL_MISSING');
    if (project.github.repositories.length && !project.github.oauthGrant && !credentials[project.github.tokenEnv]) throw new AppError('GITHUB_CREDENTIAL_MISSING');
    if (!project.github.repositories.length || project.github.oauthGrant) delete credentials[project.github.tokenEnv];
    if (project.jira.oauthGrant) { delete credentials[project.jira.emailEnv]; delete credentials[project.jira.tokenEnv]; }
    return { project, credentials };
  }
  async check(input: ConnectionInput, probe: Probe = probeConnections) {
    await this.reload(true);
    const prepared = this.prepare(input, this.document);
    return probe(prepared.project, (name) => { const value = prepared.credentials[name]; if (!value) throw new AppError('CREDENTIAL_MISSING'); return value; });
  }
  async save(input: ConnectionInput) {
    await this.reload(true);
    this.document = await this.store.update(input.revision, this.document, (current) => {
      const prepared = this.prepare(input, current);
      const projects = [...current.projects.filter((p) => p.id !== input.originalId), prepared.project];
      const used = new Set(projects.flatMap(names));
      return { ...current, projects, credentials: Object.fromEntries(Object.entries(prepared.credentials).filter(([key]) => used.has(key))) };
    });
    this.demoOverride = false;
  }
  async remove(id: string, revision: string) {
    await this.reload(true);
    this.document = await this.store.update(revision, this.document, (current) => {
      if (!current.projects.some((p) => p.id === id)) throw new AppError('CONNECTION_NOT_FOUND');
      const projects = current.projects.filter((p) => p.id !== id), used = new Set(projects.flatMap(names));
      return { ...current, projects, credentials: Object.fromEntries(Object.entries(current.credentials).filter(([key]) => used.has(key))) };
    });
    this.demoOverride = false;
  }
}
