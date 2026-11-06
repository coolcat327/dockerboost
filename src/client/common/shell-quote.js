// Preserve arbitrary values as one literal POSIX shell argument.
export const shellQuote = value => "'" + String(value).replaceAll("'", "'\"'\"'") + "'";
