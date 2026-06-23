import NodeCache from 'node-cache';

const cache = new NodeCache({
  stdTTL: 86400,
  checkperiod: 600,
});

export default cache;
