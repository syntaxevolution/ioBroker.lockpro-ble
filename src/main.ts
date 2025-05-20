import { Adapter, AdapterOptions } from '@iobroker/adapter-core';
const { SwitchBotBLE } = require('node-switchbot');

class SwitchbotBleAdapter extends Adapter {
    private ble: any;

    constructor(options: Partial<AdapterOptions> = {}) {
        super({
            ...options,
            name: 'switchbot-ble',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    private async onReady(): Promise<void> {
        this.ble = new SwitchBotBLE();
        await this.ble.ready;

        this.ble.onadvertisement = this.onAd.bind(this);
        this.ble.startScan([], true);
        this.log.info('Started BLE scan');
    }

    private async onAd(ad: any): Promise<void> {
        const id = ad.id.replace(/:/g, '_');
        const base = `device.${id}`;

        await this.extendObjectAsync(base, {
            type: 'device',
            common: { name: ad.address },
        });

        await this.setStateAsync(`${base}.rssi`, { val: ad.rssi as any, ack: true });

        if (ad.serviceData?.battery != null) {
            await this.setStateAsync(`${base}.battery`, { val: ad.serviceData.battery as any, ack: true });
        }

        if (ad.serviceData) {
            for (const [key, val] of Object.entries(ad.serviceData)) {
                if (key === 'battery') continue;
                await this.setStateAsync(`${base}.${key}`, { val: val as any, ack: true });
            }
        }
    }

    private onUnload(callback: () => void): void {
        try {
            this.ble.stopScan();
        } catch {
            // ignore
        }
        callback();
    }
}

if (require.main === module) {
    // instantiate adapter with default options
    // @ts-ignore
    new SwitchbotBleAdapter({});
}

export = SwitchbotBleAdapter;