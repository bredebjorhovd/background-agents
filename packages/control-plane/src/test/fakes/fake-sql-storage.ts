/**
 * Fake SQL storage for testing Durable Objects without real SQLite.
 */

type SQLValue = string | number | null | ArrayBuffer;
type SQLRow = Record<string, SQLValue>;

/**
 * Minimal fake implementation of DurableObjectStorage's SQL interface.
 * Stores data in memory as a simple object.
 */
export class FakeSqlStorage {
  private _tables: Map<string, Map<string, SQLRow>> = new Map();
  private _autoIncrementCounters: Map<string, number> = new Map();

  /**
   * Execute a SQL query.
   * Only supports basic INSERT, UPDATE, SELECT, DELETE operations.
   */
  exec(query: string, ...params: SQLValue[]): { results: SQLRow[] } {
    const normalizedQuery = query.trim().toLowerCase();

    // CREATE TABLE - extract table name and store empty map
    if (normalizedQuery.startsWith("create table")) {
      const match = query.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?(\w+)/i);
      if (match) {
        const tableName = match[1];
        if (!this._tables.has(tableName)) {
          this._tables.set(tableName, new Map());
        }
      }
      return { results: [] };
    }

    // INSERT - store row
    if (normalizedQuery.startsWith("insert into")) {
      const match = query.match(/insert\s+into\s+(\w+)/i);
      if (match) {
        const tableName = match[1];
        const table = this._tables.get(tableName) || new Map();
        this._tables.set(tableName, table);

        // Extract column names and values (simple implementation)
        const columnsMatch = query.match(/\(([^)]+)\)/);
        const columns = columnsMatch ? columnsMatch[1].split(",").map((c) => c.trim()) : [];

        const row: SQLRow = {};
        columns.forEach((col, index) => {
          row[col] = params[index] ?? null;
        });

        // Use first column as ID
        const id = row[columns[0]] as string;
        table.set(id, row);
      }
      return { results: [] };
    }

    // UPDATE - modify existing row
    if (normalizedQuery.startsWith("update")) {
      const match = query.match(/update\s+(\w+)/i);
      if (match) {
        const tableName = match[1];
        const table = this._tables.get(tableName);
        if (table) {
          // For simplicity, update all rows with provided params
          const setMatch = query.match(/set\s+(.+?)(?:where|$)/i);
          if (setMatch) {
            const sets = setMatch[1].split(",");
            const updates: Record<string, SQLValue> = {};
            sets.forEach((set, index) => {
              const [col] = set.trim().split("=");
              updates[col.trim()] = params[index];
            });

            table.forEach((row) => {
              Object.assign(row, updates);
            });
          }
        }
      }
      return { results: [] };
    }

    // SELECT - retrieve rows
    if (normalizedQuery.startsWith("select")) {
      const match = query.match(/from\s+(\w+)/i);
      if (match) {
        const tableName = match[1];
        const table = this._tables.get(tableName);
        if (!table) {
          return { results: [] };
        }

        let results = Array.from(table.values());

        // Apply WHERE clause (basic support for "WHERE column = ?")
        if (normalizedQuery.includes("where")) {
          const whereMatch = query.match(/where\s+(\w+)\s*=\s*\?/i);
          if (whereMatch && params.length > 0) {
            const column = whereMatch[1];
            const value = params[0];
            results = results.filter((row) => row[column] === value);
          }
        }

        // Apply LIMIT
        if (normalizedQuery.includes("limit")) {
          const limitMatch = query.match(/limit\s+(\d+)/i);
          if (limitMatch) {
            const limit = parseInt(limitMatch[1], 10);
            results = results.slice(0, limit);
          }
        }

        return { results };
      }
      return { results: [] };
    }

    // DELETE - remove rows
    if (normalizedQuery.startsWith("delete from")) {
      const match = query.match(/delete\s+from\s+(\w+)/i);
      if (match) {
        const tableName = match[1];
        const table = this._tables.get(tableName);
        if (table) {
          if (normalizedQuery.includes("where")) {
            const whereMatch = query.match(/where\s+(\w+)\s*=\s*\?/i);
            if (whereMatch && params.length > 0) {
              const column = whereMatch[1];
              const value = params[0];
              const toDelete: string[] = [];
              table.forEach((row, id) => {
                if (row[column] === value) {
                  toDelete.push(id);
                }
              });
              toDelete.forEach((id) => table.delete(id));
            }
          } else {
            table.clear();
          }
        }
      }
      return { results: [] };
    }

    return { results: [] };
  }

  /**
   * Clear all stored data.
   */
  clear(): void {
    this._tables.clear();
    this._autoIncrementCounters.clear();
  }

  /**
   * Get all data from a table (for testing assertions).
   */
  getTable(tableName: string): SQLRow[] {
    const table = this._tables.get(tableName);
    return table ? Array.from(table.values()) : [];
  }
}
