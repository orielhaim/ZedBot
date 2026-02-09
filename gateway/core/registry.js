export class ChannelRegistry {
  constructor() {
    this.channels = new Map(); // id -> instance
    this.configs = new Map(); // id -> config
  }

  registerConfig(config) {
    this.configs.set(config.id, config);
  }

  getConfigs() {
    return Array.from(this.configs.values());
  }

  getConfig(id) {
    return this.configs.get(id);
  }

  addChannel(id, instance) {
    this.channels.set(id, instance);
  }

  getChannel(id) {
    return this.channels.get(id);
  }

  getAllChannels() {
    return Array.from(this.channels.values());
  }

  removeChannel(id) {
    this.channels.delete(id);
  }
}
