const Datastore = require('@seald-io/nedb');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function createStore(name) {
  return new Datastore({
    filename: path.join(DATA_DIR, `${name}.db`),
    autoload: true,
  });
}

// 所有集合
const stores = {
  files: createStore('files'),
  doc_chunks: createStore('doc_chunks'),
};

// promisify 常用方法
function promisifyStore(store) {
  return {
    insert(doc) {
      return new Promise((resolve, reject) => {
        store.insert(doc, (err, doc) => err ? reject(err) : resolve(doc));
      });
    },
    find(query, sortOpt, limit) {
      let cursor = store.find(query);
      if (sortOpt) cursor = cursor.sort(sortOpt);
      if (limit) cursor = cursor.limit(limit);
      return new Promise((resolve, reject) => {
        cursor.exec((err, docs) => err ? reject(err) : resolve(docs));
      });
    },
    findOne(query) {
      return new Promise((resolve, reject) => {
        store.findOne(query, (err, doc) => err ? reject(err) : resolve(doc));
      });
    },
    update(query, update) {
      return new Promise((resolve, reject) => {
        store.update(query, update, {}, (err, n) => err ? reject(err) : resolve(n));
      });
    },
    remove(query) {
      return new Promise((resolve, reject) => {
        store.remove(query, {}, (err, n) => err ? reject(err) : resolve(n));
      });
    },
  };
}

module.exports = {
  stores,
  files: promisifyStore(stores.files),
  doc_chunks: promisifyStore(stores.doc_chunks),
};
