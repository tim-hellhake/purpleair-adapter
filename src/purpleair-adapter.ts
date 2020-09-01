/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

import { Adapter, Device, Property } from 'gateway-addon';
import GeoPoint from 'geopoint';
import fetch from 'node-fetch';

let debug: (message?: any, ...optionalParams: any[]) => void = () => { }

class Purpleair extends Device {

  constructor(private adapter: Adapter, sensor: any) {
    super(adapter, `purpleair-${sensor.ID}`);
    this['@context'] = 'https://iot.mozilla.org/schemas/';
    this['@type'] = [];
    this.name = sensor.Label;
  }

  update(sensor: any) {
    if (sensor.pm_0) {
      this.updateProperty("pm_0", 'PM2.5', sensor.pm_0);
    }
  }

  updateProperty(name: string, title: string, value: any) {
    let property = this.properties.get(name);

    if (!property) {
      debug(`Creating ${title} property for ${name} in ${this.name} (${this.id})`);

      property = this.createProperty(name, {
        type: 'number',
        title,
        readOnly: true
      });

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
    const url = `https://www.purpleair.com/data.json?opt=1/mAQI/a0/cC0&fetch=true&nwlat=${nwlat}&selat=${selat}&nwlng=${nwlng}&selng=${selng}&fields=pm_0`;

    debug(`Calling ${url}`);

    const result = await fetch(url);

    if (result.status == 429) {
      debug('Rate limit exceeded, waiting for next interval');
      return;
    }

    const json: Result = await result.json();

    debug(`Result ${JSON.stringify(json)}`);

    const objects = asObjects(json);

    debug(`Objects ${JSON.stringify(objects)}`);

    for (const sensor of objects) {
      const {
        ID,
        Label
      } = sensor;

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
