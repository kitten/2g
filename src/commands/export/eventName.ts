const STRIP_SUFFIXES = [':started', ':done', ':failed'];

export function splitEventName(value: string) {
  const index = value.indexOf(':');
  if (index < 1) return null;
  return {
    category: value.slice(0, index),
    name: value.slice(index + 1),
  };
}

export function stripSuffix(name: string) {
  for (const suffix of STRIP_SUFFIXES) {
    if (name.endsWith(suffix)) return name.slice(0, -suffix.length);
  }
  return name;
}
