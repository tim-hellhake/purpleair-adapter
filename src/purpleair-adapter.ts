/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

import { Adapter, Device, Property } from 'gateway-addon';
import GeoPoint from 'geopoint';
import fetch from 'node-fetch';
import { fromPM25 } from './aqi-calculator';

let debug: (message?: any, ...optionalParams: any[]) => void = () => { }

class Purpleair extends Device {

  constructor(private adapter: Adapter, sensor: any) {
    super(adapter, `purpleair-${sensor.ID}`);
    this['@context'] = 'https://iot.mozilla.org/schemas/';
    this['@type'] = [];
    this.name = sensor.Label;
    this.update(sensor);
  }

  update(sensor: any) {
    const pm25Key = 'pm_1';

    if (sensor[pm25Key]) {
      const name = 'pm2_5';

      this.updateProperty(
        name,
        () => {
          const title = 'PM2.5';
          debug(`Creating ${title} property for ${name} in ${this.name} (${this.id})`);

          this["@type"].push('AirQualitySensor');

          return this.createProperty(name, {
            '@type': 'DensityProperty',
            type: 'number',
            title,
            readOnly: true
          })
        },
        sensor[pm25Key]);

      const aqiName = 'us-epa-pm2_5-aqi';

      this.updateProperty(
        aqiName,
        () => {
          const title = 'AQI';
          debug(`Creating ${title} property for ${aqiName} in ${this.name} (${this.id})`);

          this["@type"].push('MultiLevelSensor');

          return this.createProperty(aqiName, {
            '@type': 'LevelProperty',
            type: 'integer',
            minimum: 0,
            maximum: 500,
            title,
            readOnly: true
          })
        },
        fromPM25(sensor[pm25Key]));
    }

    const temperatureKey = 'Temperature';

    if (sensor[temperatureKey]) {
      const name = 'temperature';
      const fahrenheit = sensor[temperatureKey];
      const celsius = (fahrenheit - 32) * (5 / 9);

      this.updateProperty(
        name,
        () => {
          const title = 'Temperature';
          debug(`Creating ${title} property for ${name} in ${this.name} (${this.id})`);

          this["@type"].push('TemperatureSensor');

          return this.createProperty(name, {
            '@type': 'TemperatureProperty',
            type: 'number',
            title,
            readOnly: true
          })
        },
        celsius);
    }
  }

  updateProperty(name: string, createProperty: () => Property, value: any) {
    let property = this.properties.get(name);

    if (!property) {
      property = createProperty();
      this.adapter.handleDeviceAdded(this);
    }

    property.setCachedValueAndNotify(value);
  }

  createProperty(name: string, description: any) {
    const property = new Property(this, name, description);
    this.properties.set(name, property);
    return property;
  }
}

export class PurpleairAdapter extends Adapter {
  private devices: { [key: string]: Purpleair } = {};

  constructor(addonManager: any, private manifest: any) {
    super(addonManager, PurpleairAdapter.name, manifest.id);
    addonManager.addAdapter(this);
    this.start();
  }

  private async start() {
    const {
      latitude,
      longitude,
      radius
    } = this.manifest.moziot.config;

    if (this.manifest.moziot.config.debug) {
      debug = console.log;
    }

    const statueOfLiberty = new GeoPoint(latitude, longitude);
    const [sw, ne] = statueOfLiberty.boundingCoordinates(radius, undefined, true);
    const nwlat = ne.latitude();
    const selat = sw.latitude();
    const nwlng = sw.longitude();
    const selng = ne.longitude();

    this.poll(nwlat, selat, nwlng, selng);
    setInterval(async () => this.poll(nwlat, selat, nwlng, selng), 35000);
  }

  private async poll(nwlat: any, selat: any, nwlng: any, selng: any) {
    const url = `https://www.purpleair.com/data.json?opt=1/mAQI/a0/cC0&fetch=true&nwlat=${nwlat}&selat=${selat}&nwlng=${nwlng}&selng=${selng}&fields=pm_1,temperature`;

    debug(`Calling ${url}`);

    const result = await fetch(url);

    if (result.status == 429) {
      debug('Rate limit exceeded, waiting for next interval');
      return;
    }

    const raw: string = await result.text();
    let json: Result;

    try {
      json = JSON.parse(raw);
    } catch (e) {
      debug('Invalid json response received, trying to fix...');

      try {
        const fixed = raw.replace('"data":[],', '"data":[');
        json = JSON.parse(fixed);
      } catch {
        console.error(`Could not parse json response: ${raw}`);
        throw e;
      }
    }

    debug(`Result ${JSON.stringify(json)}`);

    const objects = asObjects(json);

    debug(`Objects ${JSON.stringify(objects)}`);

    for (const sensor of objects) {
      const {
        ID,
        Label,
        Lat,
        Lon,
        Type
      } = sensor;

      if (!Lat && !Lon) {
        debug(`Ignoring ${ID} because Lat & Lon are not present`);
        continue;
      }

      if (Type != 0) {
        debug(`Ignoring ${ID} because it's not an outdoor sensor`);
        continue;
      }

      let device = this.devices[ID];

      if (!device) {
        console.log(`Creating device for ${Label} (${ID})`);
        device = new Purpleair(this, sensor);
        this.devices[ID] = device;
        this.handleDeviceAdded(device);
      }

      device.update(sensor);
    }
  }
}

function asObjects(result: Result) {
  const results = [];

  for (let dataIndex = 0; dataIndex < result.fields.length; dataIndex++) {
    const obj: { [key: string]: any } = {};
    const data = result.data[dataIndex];

    for (let fieldIndex = 0; fieldIndex < result.fields.length; fieldIndex++) {
      obj[result.fields[fieldIndex]] = data[fieldIndex];
    }

    results.push(obj);
  }

  return results;
}

interface Result {
  fields: string[],
  data: any[][]
}
