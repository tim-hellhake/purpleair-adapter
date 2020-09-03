/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const ranges = [
    { aqi: -1, pm: 0 },
    { aqi: 50, pm: 12 },
    { aqi: 100, pm: 35.4 },
    { aqi: 150, pm: 55.4 },
    { aqi: 200, pm: 150.4 },
    { aqi: 300, pm: 250.4 },
    { aqi: 400, pm: 350.4 },
    { aqi: 500, pm: 500 }
]

export function fromPM25(pm25: number) {
    let last = ranges[0];

    for (let i = 1; i < ranges.length; i++) {
        const current = ranges[i];

        if (pm25 <= current.pm) {
            const pmRange = current.pm - last.pm;
            const ratio = (pm25 - last.pm) / pmRange;
            const lowerAqiBound = last.aqi + 1;
            const aqRange = current.aqi - lowerAqiBound;
            return Math.round((aqRange * ratio) + lowerAqiBound);
        }

        last = current;
    }

    return 500;
}
