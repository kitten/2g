export class Queue<T> {
  #items: Array<T | undefined> = [];
  #head = 0;

  get length() {
    return this.#items.length - this.#head;
  }

  push(item: T) {
    this.#items.push(item);
  }

  shift(): T | undefined {
    if (!this.length) return;
    const item = this.#items[this.#head];
    this.#items[this.#head++] = undefined;
    if (this.#head === this.#items.length) {
      this.#items.length = 0;
      this.#head = 0;
    } else if (this.#head >= 1024 && this.#head * 2 >= this.#items.length) {
      // Release consumed slots without moving the pending tail per item.
      this.#items = this.#items.slice(this.#head);
      this.#head = 0;
    }
    return item;
  }
}
