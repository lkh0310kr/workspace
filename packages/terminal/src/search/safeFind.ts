type SearchOptions = object

// Narrow viewport decoration errors are ignored so searching cannot crash the pane.
export function safeFind(
  search: (term: string, options?: SearchOptions) => boolean,
  term: string,
  options?: SearchOptions
): boolean {
  try {
    return search(term, options)
  } catch (error) {
    if (error instanceof Error && /only accepts positive integers/i.test(error.message)) {
      return false
    }
    throw error
  }
}
