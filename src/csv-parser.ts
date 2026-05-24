import { readFileSync } from 'fs';
import { UrlRecord } from './types.js';

export function parseCsv(filePath: string): UrlRecord[] {
  const content = readFileSync(filePath, 'utf-8');
  const cleanContent = content.replace(/^\uFEFF/, '');
  const lines = cleanContent.split(/\r?\n/);
  
  const records: UrlRecord[] = [];
  let lineIndex = 0;
  
  for (const line of lines) {
    lineIndex++;
    const trimmed = line.trim();
    
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    
    // Auto-detect header: skip if first non-empty line is not a valid URL
    if (records.length === 0 && !trimmed.includes('.') && !trimmed.includes('://')) {
      continue;
    }
    
    records.push({
      raw: trimmed,
      normalized: trimmed,
      originalIndex: lineIndex,
    });
  }
  
  if (records.length === 0) {
    throw new Error('CSV file contains no valid URLs');
  }
  
  return records;
}
