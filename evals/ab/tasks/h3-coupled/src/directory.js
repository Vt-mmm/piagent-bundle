import { normalize } from './text.js';

export function display(person) {
  return normalize(`${person.first}   ${person.last}`);
}

export function search(people, query) {
  const q = normalize(query);
  return people.filter(p => normalize(`${p.first} ${p.last}`).includes(q));
}
