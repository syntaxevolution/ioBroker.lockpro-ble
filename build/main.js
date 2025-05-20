"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
const Switchbot = require("node-switchbot");
class LockProBle extends utils.Adapter {
  sb;
  // SwitchBot BLE transport
  lock;
  // WoSmartLock instance
  pollTimer;
  constructor(options = {}) {
    super({ ...options, name: "lockpro-ble" });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
    this.sb = new Switchbot(this.config.bleHci);
  }
  /** Lifecycle – called once all configuration is loaded. */
  async onReady() {
    var _a;
    const cfg = this.config;
    if (!cfg.lockMac) {
      this.log.error("No MAC address configured \u2013 aborting.");
      return;
    }
    this.log.info(`Scanning for Lock Pro (${cfg.lockMac}) \u2026`);
    await this.sb.startScan();
    try {
      this.lock = await this.sb.waitFirst(
        // …predicate…,
        6e4
        // bump to 60 s
      );
      this.log.info("Lock discovered!");
    } catch (err) {
      this.log.error("waitFirst() timed out or failed: " + err);
    } finally {
      await this.sb.stopScan();
    }
    if (!this.lock) throw new Error("Lock Pro not found \u2013 check MAC / distance / power");
    if (((_a = this.lock) == null ? void 0 : _a.rssi) !== void 0) this.log.info(`Found Lock Pro via BLE at RSSI ${this.lock.rssi}`);
    if (cfg.keyId && cfg.encKey) {
      this.lock.setKey(cfg.keyId, cfg.encKey);
    }
    await this.defineObjects();
    await this.updateStatus();
    const poll = Number(cfg.poll) || 15;
    this.pollTimer = setInterval(() => this.updateStatus(), poll * 1e3);
  }
  /** Define ioBroker object tree. */
  async defineObjects() {
    await this.extendObjectAsync("state", { type: "channel" });
    await this.extendObjectAsync("state.locked", {
      type: "state",
      common: { name: "locked", type: "boolean", role: "lock", read: true, write: false },
      native: {}
    });
    await this.extendObjectAsync("state.battery", {
      type: "state",
      common: { name: "battery", type: "number", role: "value.battery", unit: "%", read: true, write: false },
      native: {}
    });
    await this.extendObjectAsync("state.door", {
      type: "state",
      common: { name: "doorState", type: "string", role: "sensor.door", read: true, write: false },
      native: {}
    });
    const button = { type: "state", common: { role: "button", type: "boolean", read: false, write: true }, native: {} };
    await this.extendObjectAsync("cmd.lock", button);
    await this.extendObjectAsync("cmd.unlock", button);
    await this.extendObjectAsync("cmd.unlockNoUnlatch", button);
  }
  /** Poll lock / battery / door status. */
  async updateStatus() {
    if (!this.lock) return;
    try {
      const s = await this.lock.getLockState();
      await this.setStateChangedAsync("state.locked", !!s.lockState, true);
      if (typeof s.battery === "number") {
        await this.setStateChangedAsync("state.battery", s.battery, true);
      }
      if (s.doorState !== void 0) {
        await this.setStateChangedAsync("state.door", s.doorState, true);
      }
    } catch (e) {
      this.log.error(`Status update failed: ${e}`);
    }
  }
  /** Handle button presses. */
  async onStateChange(id, state) {
    if (!state || state.ack || !this.lock) return;
    try {
      if (id.endsWith("cmd.lock")) await this.lock.lock();
      else if (id.endsWith("cmd.unlockNoUnlatch")) await this.lock.unlockNoUnlatch();
      else if (id.endsWith("cmd.unlock")) await this.lock.unlock();
    } catch (e) {
      this.log.warn(String(e));
    } finally {
      await this.setStateAsync(id, false, true);
    }
  }
  /** Adapter unload. */
  async onUnload(callback) {
    if (this.pollTimer) clearInterval(this.pollTimer);
    try {
      await this.sb.stopScan();
    } catch {
    }
    callback();
  }
}
if (require.main === module) new LockProBle();
module.exports = (o) => new LockProBle(o);
//# sourceMappingURL=main.js.map
