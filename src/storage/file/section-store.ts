/**
 * File-based implementation of ISectionStore.
 *
 * Mirrors FileSlideStore: JSON files under <baseDir>/sections/<id>.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { DeckId, SectionId } from '../../types/common.js';
import type { Section } from '../../types/section.js';
import type { ISectionStore } from '../interfaces.js';

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class FileSectionStore implements ISectionStore {
  private readonly dir: string;

  constructor(baseDir: string) {
    this.dir = path.join(baseDir, 'sections');
  }

  private ensureDir(): void {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private sectionPath(id: SectionId): string {
    return path.join(this.dir, `${id}.json`);
  }

  async save(section: Section): Promise<void> {
    this.ensureDir();
    fs.writeFileSync(
      this.sectionPath(section.id),
      JSON.stringify(clone(section), null, 2),
      'utf-8',
    );
  }

  async get(id: SectionId): Promise<Section | undefined> {
    const filePath = this.sectionPath(id);
    if (!fs.existsSync(filePath)) return undefined;
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data) as Section;
  }

  async getByDeck(deckId: DeckId): Promise<Section[]> {
    this.ensureDir();
    const files = fs.readdirSync(this.dir);
    const matches: Section[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const data = fs.readFileSync(path.join(this.dir, file), 'utf-8');
      const section = JSON.parse(data) as Section;
      if (section.deckId === deckId) {
        matches.push(section);
      }
    }
    return clone(matches.sort((a, b) => a.position - b.position));
  }

  async delete(id: SectionId): Promise<boolean> {
    const filePath = this.sectionPath(id);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  async deleteByDeck(deckId: DeckId): Promise<number> {
    this.ensureDir();
    const files = fs.readdirSync(this.dir);
    let count = 0;
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(this.dir, file);
      const data = fs.readFileSync(filePath, 'utf-8');
      const section = JSON.parse(data) as Section;
      if (section.deckId === deckId) {
        fs.unlinkSync(filePath);
        count++;
      }
    }
    return count;
  }
}
