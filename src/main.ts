import * as utils from "@iobroker/adapter-core";
import Switchbot = require("node-switchbot");

/**
 * ioBroker adapter class for SwitchBot Lock Pro over BLE (no cloud).
 * `node-switchbot` exports a class, so we must use `new`.
 * We keep the types as `any` to avoid TypeScript errors due to missing typings.
 */
class LockProBle extends utils.Adapter {
    private sb: any;          // SwitchBot BLE transport
    private lock?: any;       // WoSmartLock instance
    private pollTimer?: NodeJS.Timeout;

    constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({ ...options, name: "lockpro-ble" });

        // ioBroker EventEmitter generics are missing – force-cast to any
        (this as any).on("ready", this.onReady.bind(this));
        (this as any).on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));

        // instantiate the SwitchBot BLE transport (class)
        this.sb = new Switchbot((this.config as any).bleHci);
    }

    /** Lifecycle – called once all configuration is loaded. */
    private async onReady(): Promise<void> {
        const cfg = this.config as any;
        if (!cfg.lockMac) {
            this.log.error("No MAC address configured – aborting.");
            return;
        }

        this.log.info(`Scanning for Lock Pro (${cfg.lockMac}) …`);
        await this.sb.startScan();
        try {
            this.lock = await this.sb.waitFirst(
                (d: any) => d.model === "p" && d.address.toLowerCase() === cfg.lockMac.toLowerCase(),
                30000
            );
        } finally {
            await this.sb.stopScan();
        }

        if (!this.lock) throw new Error("Lock Pro not found – check MAC / distance / power");
        if (this.lock?.rssi !== undefined) this.log.info(`Found Lock Pro via BLE at RSSI ${this.lock.rssi}`);

        if (cfg.keyId && cfg.encKey) {
            this.lock.setKey(cfg.keyId, cfg.encKey);
        }

        await this.defineObjects();
        await this.updateStatus();

        const poll = Number(cfg.poll) || 15;
        this.pollTimer = setInterval(() => this.updateStatus(), poll * 1000);
    }

    /** Define ioBroker object tree. */
    private async defineObjects(): Promise<void> {
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

        const button: any = { type: "state", common: { role: "button", type: "boolean", read: false, write: true }, native: {} };
        await this.extendObjectAsync("cmd.lock", button);
        await this.extendObjectAsync("cmd.unlock", button);
        await this.extendObjectAsync("cmd.unlockNoUnlatch", button);
    }

    /** Poll lock / battery / door status. */
    private async updateStatus(): Promise<void> {
        if (!this.lock) return;
        try {
            const s = await this.lock.getLockState();
            await this.setStateChangedAsync("state.locked", !!s.lockState, true);
            if (typeof s.battery === "number") {
                await this.setStateChangedAsync("state.battery", s.battery, true);
            }
            if (s.doorState !== undefined) {
                await this.setStateChangedAsync("state.door", s.doorState, true);
            }
        } catch (e) {
            this.log.error(`Status update failed: ${e}`);
        }
    }

    /** Handle button presses. */
    private async onStateChange(id: string, state: ioBroker.State | null): Promise<void> {
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
    private async onUnload(callback: () => void): Promise<void> {
        if (this.pollTimer) clearInterval(this.pollTimer);
        try {
            await this.sb.stopScan();
        } catch {
            // ignore
        }
        callback();
    }
}

// Export factory and standalone execution
export = (o?: Partial<utils.AdapterOptions>) => new LockProBle(o);
if (require.main === module) new LockProBle();