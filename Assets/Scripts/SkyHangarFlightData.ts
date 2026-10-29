// AUTO-GENERATED from Assets/Data/flights.json by a one-time build script. Do not edit by hand.
// Recorded sample data - the Lens never fetches at runtime.
// Sources: adsb.lol (ODbL), adsbdb.com, CelesTrak.

export type SkyKind = "plane" | "helicopter" | "satellite";

export interface SkyObjectInfo {
  id: string;
  kind: SkyKind;
  callsign: string;
  flight: string;
  airline: string;
  airlineIcao: string;
  origin: string;
  originCity: string;
  destination: string;
  destinationCity: string;
  departUtc: string;
  arriveUtc: string;
  aircraftType: string;
  aircraftTypeName: string;
  registration: string;
  altitudeFt: number;
  altitudeKm?: number;
  speedKt: number;
  trackDeg: number;
  lat: number;
  lon: number;
  distanceKm: number;
  azimuthDeg: number;
  realElevationDeg: number;
  skyElevationDeg: number;
  skyAzimuthDeg: number;
  /** Minutes since takeoff / until landing at snapshot time (planes; 0 otherwise). */
  departedAgoMin: number;
  arrivingInMin: number;
  /** Stand-in sky path as [azimuthDeg, elevationDeg] pairs: horizon/start -> object, and object -> horizon/end. */
  skyPathPast: number[][];
  skyPathAhead: number[][];
  bearingToOriginDeg: number;
  bearingToDestDeg: number;
  colors: string[];
  tle?: string[];
}

export const SNAPSHOT_UTC = "2026-10-28T13:24:42.001Z";
export interface AirportInfo { name: string; city: string; lat: number; lon: number }

/** Static airport coordinate table for every airport referenced by the recorded flights. */
export const AIRPORTS: {[iata: string]: AirportInfo} = {
  "LHR": {
    "name": "London Heathrow Airport",
    "city": "London",
    "lat": 51.4706,
    "lon": -0.46194
  },
  "CUN": {
    "name": "Cancún International Airport",
    "city": "Cancún",
    "lat": 21.0365,
    "lon": -86.8771
  },
  "ATL": {
    "name": "Hartsfield Jackson Atlanta International Airport",
    "city": "Atlanta",
    "lat": 33.6367,
    "lon": -84.4281
  },
  "GRU": {
    "name": "Guarulhos - Governador André Franco Montoro International Airport",
    "city": "São Paulo",
    "lat": -23.43194,
    "lon": -46.46778
  },
  "PVG": {
    "name": "Shanghai Pudong International Airport",
    "city": "Shanghai (Pudong)",
    "lat": 31.1434,
    "lon": 121.805
  },
  "LTN": {
    "name": "London Luton Airport",
    "city": "London",
    "lat": 51.8747,
    "lon": -0.36833
  },
  "NAP": {
    "name": "Naples International Airport",
    "city": "Nápoli",
    "lat": 40.886,
    "lon": 14.2908
  },
  "ALC": {
    "name": "Alicante-Elche Miguel Hernández Airport",
    "city": "Alicante",
    "lat": 38.2822,
    "lon": -0.55816
  },
  "STN": {
    "name": "London Stansted Airport",
    "city": "London",
    "lat": 51.885,
    "lon": 0.235
  },
  "GVA": {
    "name": "Geneva Cointrin International Airport",
    "city": "Geneva",
    "lat": 46.2381,
    "lon": 6.10895
  },
  "AUH": {
    "name": "Abu Dhabi International Airport",
    "city": "Abu Dhabi",
    "lat": 24.44376,
    "lon": 54.65172
  },
  "HEL": {
    "name": "Helsinki Vantaa Airport",
    "city": "Helsinki",
    "lat": 60.3172,
    "lon": 24.9633
  },
  "LIS": {
    "name": "Humberto Delgado Airport (Lisbon Portela Airport)",
    "city": "Lisbon",
    "lat": 38.7813,
    "lon": -9.13592
  },
  "HKG": {
    "name": "Hong Kong International Airport",
    "city": "Hong Kong",
    "lat": 22.3089,
    "lon": 113.915
  },
  "ACE": {
    "name": "César Manrique-Lanzarote Airport",
    "city": "Lanzarote Island",
    "lat": 28.9455,
    "lon": -13.6052
  },
  "CDG": {
    "name": "Charles de Gaulle International Airport",
    "city": "Paris",
    "lat": 49.0128,
    "lon": 2.55
  },
  "SEA": {
    "name": "Seattle Tacoma International Airport",
    "city": "Seattle",
    "lat": 47.449,
    "lon": -122.309
  }
};

export const OBSERVER_NAME = "Ealing, London, UK";

export const SKY_OBJECTS: SkyObjectInfo[] = [
  {
    "id": "VS93",
    "kind": "plane",
    "callsign": "VIR93",
    "flight": "VS93",
    "airline": "Virgin Atlantic Airways",
    "airlineIcao": "VIR",
    "origin": "LHR",
    "originCity": "London",
    "destination": "CUN",
    "destinationCity": "Cancún",
    "departUtc": "13:03",
    "arriveUtc": "22:34",
    "aircraftType": "A35K",
    "aircraftTypeName": "Airbus A350-1000",
    "registration": "G-VLIB",
    "altitudeFt": 6100,
    "speedKt": 256,
    "trackDeg": 297,
    "lat": 51.469597,
    "lon": -0.769958,
    "distanceKm": 32.7,
    "azimuthDeg": 264.3,
    "realElevationDeg": 3.5,
    "skyElevationDeg": 43.9,
    "bearingToOriginDeg": 90,
    "bearingToDestDeg": 281,
    "colors": [
      "#EBEDF2",
      "#8FB4E8"
    ],
    "departedAgoMin": 21,
    "arrivingInMin": 549,
    "skyAzimuthDeg": 264.3,
    "skyPathPast": [
      [
        253.81,
        0
      ],
      [
        254.65,
        1.32
      ],
      [
        255.5,
        2.65
      ],
      [
        256.34,
        3.97
      ],
      [
        257.09,
        5.35
      ],
      [
        257.83,
        6.74
      ],
      [
        258.56,
        8.13
      ],
      [
        259.22,
        9.56
      ],
      [
        259.86,
        11
      ],
      [
        260.5,
        12.43
      ],
      [
        261.07,
        13.9
      ],
      [
        261.62,
        15.38
      ],
      [
        262.18,
        16.85
      ],
      [
        262.65,
        18.35
      ],
      [
        263.03,
        19.84
      ],
      [
        263.35,
        21.34
      ],
      [
        263.55,
        22.84
      ],
      [
        263.69,
        24.34
      ],
      [
        263.76,
        25.84
      ],
      [
        263.77,
        27.35
      ],
      [
        263.75,
        28.86
      ],
      [
        263.67,
        30.37
      ],
      [
        263.55,
        31.88
      ],
      [
        263.43,
        33.39
      ],
      [
        263.26,
        34.9
      ],
      [
        263.1,
        36.42
      ],
      [
        262.93,
        37.95
      ],
      [
        262.77,
        39.47
      ],
      [
        262.63,
        41
      ],
      [
        262.51,
        42.53
      ],
      [
        262.4,
        44.07
      ],
      [
        262.35,
        45.6
      ],
      [
        262.55,
        47.12
      ],
      [
        263.05,
        46.89
      ],
      [
        263.68,
        45.4
      ],
      [
        264.3,
        43.9
      ]
    ],
    "skyPathAhead": [
      [
        264.3,
        43.9
      ],
      [
        264.82,
        42.67
      ],
      [
        265.36,
        41.44
      ],
      [
        265.95,
        40.2
      ],
      [
        266.56,
        38.97
      ],
      [
        267.18,
        37.74
      ],
      [
        267.84,
        36.51
      ],
      [
        268.5,
        35.28
      ],
      [
        269.17,
        34.04
      ],
      [
        269.85,
        32.81
      ],
      [
        270.54,
        31.58
      ],
      [
        271.21,
        30.34
      ],
      [
        271.88,
        29.11
      ],
      [
        272.52,
        27.87
      ],
      [
        273.15,
        26.63
      ],
      [
        273.74,
        25.39
      ],
      [
        274.29,
        24.15
      ],
      [
        274.81,
        22.89
      ],
      [
        275.28,
        21.64
      ],
      [
        275.7,
        20.39
      ],
      [
        276.05,
        19.13
      ],
      [
        276.33,
        17.87
      ],
      [
        276.54,
        16.6
      ],
      [
        276.67,
        15.33
      ],
      [
        276.77,
        14.05
      ],
      [
        276.87,
        12.77
      ],
      [
        276.96,
        11.5
      ],
      [
        277.05,
        10.22
      ],
      [
        277.13,
        8.94
      ],
      [
        277.21,
        7.67
      ],
      [
        277.29,
        6.39
      ],
      [
        277.36,
        5.11
      ],
      [
        277.44,
        3.83
      ],
      [
        277.5,
        2.56
      ],
      [
        277.57,
        1.28
      ],
      [
        277.65,
        0
      ]
    ]
  },
  {
    "id": "DL31",
    "kind": "plane",
    "callsign": "DAL31",
    "flight": "DL31",
    "airline": "Delta Air Lines",
    "airlineIcao": "DAL",
    "origin": "LHR",
    "originCity": "London",
    "destination": "ATL",
    "destinationCity": "Atlanta",
    "departUtc": "13:02",
    "arriveUtc": "21:13",
    "aircraftType": "A332",
    "aircraftTypeName": "Airbus A330-200",
    "registration": "N857NW",
    "altitudeFt": 5700,
    "speedKt": 275,
    "trackDeg": 2,
    "lat": 51.65292,
    "lon": -0.690689,
    "distanceKm": 31.9,
    "azimuthDeg": 302.4,
    "realElevationDeg": 3.4,
    "skyElevationDeg": 44.5,
    "bearingToOriginDeg": 142,
    "bearingToDestDeg": 288,
    "colors": [
      "#EBEDF2",
      "#8FB4E8"
    ],
    "departedAgoMin": 22,
    "arrivingInMin": 468,
    "skyAzimuthDeg": 302.4,
    "skyPathPast": [
      [
        253.81,
        0
      ],
      [
        254.97,
        1.19
      ],
      [
        256.14,
        2.38
      ],
      [
        257.26,
        3.61
      ],
      [
        258.33,
        4.88
      ],
      [
        259.39,
        6.16
      ],
      [
        260.37,
        7.51
      ],
      [
        261.35,
        8.86
      ],
      [
        262.25,
        10.27
      ],
      [
        263.15,
        11.68
      ],
      [
        263.97,
        13.13
      ],
      [
        264.79,
        14.59
      ],
      [
        265.54,
        16.09
      ],
      [
        266.36,
        17.6
      ],
      [
        267.38,
        19.17
      ],
      [
        268.62,
        20.79
      ],
      [
        270.03,
        22.45
      ],
      [
        271.62,
        24.13
      ],
      [
        273.32,
        25.86
      ],
      [
        275.16,
        27.61
      ],
      [
        277.06,
        29.39
      ],
      [
        279.04,
        31.19
      ],
      [
        281.07,
        33
      ],
      [
        283.11,
        34.82
      ],
      [
        285.14,
        36.65
      ],
      [
        287.15,
        38.48
      ],
      [
        289.1,
        40.32
      ],
      [
        290.97,
        42.15
      ],
      [
        292.75,
        43.97
      ],
      [
        294.41,
        45.78
      ],
      [
        295.92,
        47.57
      ],
      [
        297.33,
        49.34
      ],
      [
        298.92,
        49.05
      ],
      [
        300.42,
        47.58
      ],
      [
        301.58,
        46.06
      ],
      [
        302.4,
        44.5
      ]
    ],
    "skyPathAhead": [
      [
        302.4,
        44.5
      ],
      [
        302.7,
        43.33
      ],
      [
        302.72,
        42.13
      ],
      [
        302.47,
        40.89
      ],
      [
        301.99,
        39.62
      ],
      [
        301.29,
        38.32
      ],
      [
        300.42,
        37
      ],
      [
        299.39,
        35.67
      ],
      [
        298.23,
        34.31
      ],
      [
        296.97,
        32.94
      ],
      [
        295.65,
        31.56
      ],
      [
        294.27,
        30.18
      ],
      [
        292.87,
        28.79
      ],
      [
        291.48,
        27.41
      ],
      [
        290.1,
        26.02
      ],
      [
        288.79,
        24.65
      ],
      [
        287.57,
        23.28
      ],
      [
        286.44,
        21.93
      ],
      [
        285.45,
        20.6
      ],
      [
        284.61,
        19.29
      ],
      [
        283.96,
        18
      ],
      [
        283.52,
        16.73
      ],
      [
        283.31,
        15.5
      ],
      [
        283.35,
        14.3
      ],
      [
        283.47,
        13.11
      ],
      [
        283.58,
        11.92
      ],
      [
        283.68,
        10.73
      ],
      [
        283.78,
        9.54
      ],
      [
        283.88,
        8.34
      ],
      [
        283.97,
        7.15
      ],
      [
        284.06,
        5.96
      ],
      [
        284.15,
        4.77
      ],
      [
        284.23,
        3.57
      ],
      [
        284.31,
        2.38
      ],
      [
        284.38,
        1.19
      ],
      [
        284.5,
        0
      ]
    ]
  },
  {
    "id": "JJ8084",
    "kind": "plane",
    "callsign": "TAM8084",
    "flight": "JJ8084",
    "airline": "TAM Brazilian Airlines",
    "airlineIcao": "TAM",
    "origin": "GRU",
    "originCity": "São Paulo",
    "destination": "LHR",
    "destinationCity": "London",
    "departUtc": "02:23",
    "arriveUtc": "13:37",
    "aircraftType": "B77W",
    "aircraftTypeName": "Boeing 777-300ER",
    "registration": "PT-MUE",
    "altitudeFt": 10150,
    "speedKt": 322,
    "trackDeg": 45,
    "lat": 51.170563,
    "lon": -0.663485,
    "distanceKm": 44.5,
    "azimuthDeg": 214.7,
    "realElevationDeg": 4.2,
    "skyElevationDeg": 35.2,
    "bearingToOriginDeg": 221,
    "bearingToDestDeg": 23,
    "colors": [
      "#EBEDF2",
      "#8FB4E8"
    ],
    "departedAgoMin": 661,
    "arrivingInMin": 12,
    "skyAzimuthDeg": 214.7,
    "skyPathPast": [
      [
        225.43,
        0
      ],
      [
        225.54,
        0.99
      ],
      [
        225.6,
        1.99
      ],
      [
        225.66,
        2.99
      ],
      [
        225.73,
        3.99
      ],
      [
        225.79,
        4.99
      ],
      [
        225.86,
        5.99
      ],
      [
        225.93,
        6.99
      ],
      [
        226,
        7.99
      ],
      [
        226.08,
        8.99
      ],
      [
        226.15,
        9.99
      ],
      [
        226.23,
        10.99
      ],
      [
        226.31,
        11.99
      ],
      [
        226.35,
        12.99
      ],
      [
        226.24,
        13.99
      ],
      [
        225.98,
        14.99
      ],
      [
        225.6,
        16.01
      ],
      [
        225.11,
        17.02
      ],
      [
        224.51,
        18.04
      ],
      [
        223.84,
        19.05
      ],
      [
        223.1,
        20.07
      ],
      [
        222.3,
        21.09
      ],
      [
        221.49,
        22.1
      ],
      [
        220.64,
        23.13
      ],
      [
        219.8,
        24.14
      ],
      [
        218.95,
        25.16
      ],
      [
        218.15,
        26.18
      ],
      [
        217.38,
        27.19
      ],
      [
        216.68,
        28.21
      ],
      [
        216.05,
        29.22
      ],
      [
        215.5,
        30.23
      ],
      [
        215.07,
        31.23
      ],
      [
        214.75,
        32.23
      ],
      [
        214.57,
        33.22
      ],
      [
        214.55,
        34.22
      ],
      [
        214.7,
        35.2
      ]
    ],
    "skyPathAhead": [
      [
        214.7,
        35.2
      ],
      [
        215.2,
        36.85
      ],
      [
        215.9,
        38.48
      ],
      [
        216.81,
        40.1
      ],
      [
        217.89,
        41.71
      ],
      [
        219.17,
        43.31
      ],
      [
        220.47,
        43.26
      ],
      [
        221.57,
        41.57
      ],
      [
        222.75,
        39.89
      ],
      [
        223.99,
        38.2
      ],
      [
        225.3,
        36.52
      ],
      [
        226.64,
        34.84
      ],
      [
        228.01,
        33.17
      ],
      [
        229.38,
        31.5
      ],
      [
        230.77,
        29.84
      ],
      [
        232.13,
        28.19
      ],
      [
        233.48,
        26.55
      ],
      [
        234.77,
        24.91
      ],
      [
        236.03,
        23.29
      ],
      [
        237.2,
        21.69
      ],
      [
        238.32,
        20.09
      ],
      [
        239.32,
        18.53
      ],
      [
        240.24,
        16.99
      ],
      [
        241.02,
        15.46
      ],
      [
        241.83,
        13.98
      ],
      [
        242.65,
        12.49
      ],
      [
        243.57,
        11.08
      ],
      [
        244.5,
        9.66
      ],
      [
        245.52,
        8.32
      ],
      [
        246.56,
        6.99
      ],
      [
        247.65,
        5.71
      ],
      [
        248.81,
        4.49
      ],
      [
        249.98,
        3.28
      ],
      [
        251.24,
        2.17
      ],
      [
        252.53,
        1.09
      ],
      [
        253.81,
        0
      ]
    ]
  },
  {
    "id": "BA169",
    "kind": "plane",
    "callsign": "BAW169",
    "flight": "BA169",
    "airline": "British Airways",
    "airlineIcao": "BAW",
    "origin": "LHR",
    "originCity": "London",
    "destination": "PVG",
    "destinationCity": "Shanghai (Pudong)",
    "departUtc": "13:04",
    "arriveUtc": "00:03",
    "aircraftType": "B789",
    "aircraftTypeName": "Boeing 787-9",
    "registration": "G-ZBKC",
    "altitudeFt": 3400,
    "speedKt": 248,
    "trackDeg": 136,
    "lat": 51.409195,
    "lon": -0.509973,
    "distanceKm": 17.7,
    "azimuthDeg": 235.3,
    "realElevationDeg": 3.8,
    "skyElevationDeg": 55,
    "bearingToOriginDeg": 26,
    "bearingToDestDeg": 47,
    "colors": [
      "#EBEDF2",
      "#8FB4E8"
    ],
    "departedAgoMin": 21,
    "arrivingInMin": 639,
    "skyAzimuthDeg": 235.3,
    "skyPathPast": [
      [
        253.81,
        0
      ],
      [
        254.34,
        1.9
      ],
      [
        254.87,
        3.8
      ],
      [
        255.41,
        5.69
      ],
      [
        255.94,
        7.59
      ],
      [
        256.47,
        9.49
      ],
      [
        257,
        11.39
      ],
      [
        257.53,
        13.28
      ],
      [
        258.17,
        15.16
      ],
      [
        258.85,
        17.02
      ],
      [
        259.52,
        18.89
      ],
      [
        260.2,
        20.76
      ],
      [
        260.88,
        22.62
      ],
      [
        261.38,
        24.46
      ],
      [
        261.31,
        26.2
      ],
      [
        260.79,
        27.86
      ],
      [
        259.9,
        29.41
      ],
      [
        258.6,
        30.91
      ],
      [
        256.93,
        32.34
      ],
      [
        254.95,
        33.71
      ],
      [
        252.72,
        35.06
      ],
      [
        250.27,
        36.37
      ],
      [
        247.69,
        37.66
      ],
      [
        245.25,
        38.9
      ],
      [
        242.83,
        40.16
      ],
      [
        240.43,
        41.41
      ],
      [
        238.09,
        42.67
      ],
      [
        235.89,
        43.96
      ],
      [
        233.88,
        45.27
      ],
      [
        232.12,
        46.62
      ],
      [
        230.9,
        47.98
      ],
      [
        230.85,
        49.24
      ],
      [
        231.21,
        50.56
      ],
      [
        232.04,
        51.96
      ],
      [
        233.38,
        53.44
      ],
      [
        235.3,
        55
      ]
    ],
    "skyPathAhead": [
      [
        235.3,
        55
      ],
      [
        242.39,
        55.23
      ],
      [
        250.05,
        55.55
      ],
      [
        258.29,
        55.83
      ],
      [
        267,
        56.17
      ],
      [
        276.12,
        56.51
      ],
      [
        285.58,
        56.81
      ],
      [
        295.32,
        57.17
      ],
      [
        305.21,
        57.41
      ],
      [
        315.26,
        57.66
      ],
      [
        325.26,
        57.76
      ],
      [
        335.2,
        57.75
      ],
      [
        344.92,
        57.54
      ],
      [
        354.25,
        57.07
      ],
      [
        3,
        56.25
      ],
      [
        10.88,
        54.99
      ],
      [
        17.72,
        53.33
      ],
      [
        23.5,
        51.34
      ],
      [
        28.26,
        49.1
      ],
      [
        32.14,
        46.66
      ],
      [
        35.22,
        44.1
      ],
      [
        37.54,
        41.41
      ],
      [
        39.14,
        38.61
      ],
      [
        40.01,
        35.7
      ],
      [
        40.59,
        32.75
      ],
      [
        41.08,
        29.79
      ],
      [
        41.5,
        26.83
      ],
      [
        41.87,
        23.85
      ],
      [
        42.19,
        20.88
      ],
      [
        42.47,
        17.9
      ],
      [
        42.72,
        14.92
      ],
      [
        42.95,
        11.94
      ],
      [
        43.15,
        8.95
      ],
      [
        43.33,
        5.97
      ],
      [
        43.5,
        2.98
      ],
      [
        43.67,
        0
      ]
    ]
  },
  {
    "id": "U226DV",
    "kind": "plane",
    "callsign": "EZY26DV",
    "flight": "U226DV",
    "airline": "easyJet",
    "airlineIcao": "EZY",
    "origin": "LTN",
    "originCity": "London",
    "destination": "NAP",
    "destinationCity": "Nápoli",
    "departUtc": "13:03",
    "arriveUtc": "15:26",
    "aircraftType": "A320",
    "aircraftTypeName": "Airbus A320",
    "registration": "G-EZPX",
    "altitudeFt": 6000,
    "speedKt": 275,
    "trackDeg": 104,
    "lat": 51.7771,
    "lon": -0.288168,
    "distanceKm": 30.8,
    "azimuthDeg": 1.5,
    "realElevationDeg": 3.7,
    "skyElevationDeg": 45.3,
    "bearingToOriginDeg": 333,
    "bearingToDestDeg": 132,
    "colors": [
      "#EBEDF2",
      "#8FB4E8"
    ],
    "departedAgoMin": 21,
    "arrivingInMin": 122,
    "skyAzimuthDeg": 1.5,
    "skyPathPast": [
      [
        353.58,
        0
      ],
      [
        353.79,
        1.31
      ],
      [
        354.01,
        2.62
      ],
      [
        354.23,
        3.93
      ],
      [
        354.44,
        5.25
      ],
      [
        354.67,
        6.56
      ],
      [
        354.89,
        7.87
      ],
      [
        355.11,
        9.18
      ],
      [
        355.34,
        10.49
      ],
      [
        355.57,
        11.8
      ],
      [
        355.8,
        13.11
      ],
      [
        356.03,
        14.42
      ],
      [
        356.27,
        15.73
      ],
      [
        356.48,
        17.05
      ],
      [
        356.64,
        18.39
      ],
      [
        356.74,
        19.74
      ],
      [
        356.8,
        21.12
      ],
      [
        356.81,
        22.52
      ],
      [
        356.78,
        23.94
      ],
      [
        356.73,
        25.36
      ],
      [
        356.64,
        26.8
      ],
      [
        356.53,
        28.25
      ],
      [
        356.42,
        29.7
      ],
      [
        356.29,
        31.16
      ],
      [
        356.16,
        32.62
      ],
      [
        356.04,
        34.07
      ],
      [
        355.93,
        35.53
      ],
      [
        355.83,
        36.97
      ],
      [
        355.76,
        38.42
      ],
      [
        355.71,
        39.85
      ],
      [
        355.71,
        41.27
      ],
      [
        355.81,
        42.67
      ],
      [
        356.88,
        43.53
      ],
      [
        358.33,
        44.18
      ],
      [
        359.86,
        44.77
      ],
      [
        1.5,
        45.3
      ]
    ],
    "skyPathAhead": [
      [
        1.5,
        45.3
      ],
      [
        5.4,
        46.35
      ],
      [
        9.51,
        47.2
      ],
      [
        13.8,
        47.89
      ],
      [
        18.23,
        48.42
      ],
      [
        22.78,
        48.79
      ],
      [
        27.43,
        49.01
      ],
      [
        32.15,
        49.1
      ],
      [
        36.92,
        49.05
      ],
      [
        41.71,
        48.88
      ],
      [
        46.5,
        48.57
      ],
      [
        51.26,
        48.14
      ],
      [
        55.98,
        47.57
      ],
      [
        60.62,
        46.86
      ],
      [
        65.16,
        46.03
      ],
      [
        69.58,
        45.04
      ],
      [
        73.84,
        43.92
      ],
      [
        77.91,
        42.64
      ],
      [
        81.78,
        41.21
      ],
      [
        85.41,
        39.62
      ],
      [
        88.78,
        37.88
      ],
      [
        91.89,
        36
      ],
      [
        94.71,
        33.99
      ],
      [
        97.24,
        31.85
      ],
      [
        99.54,
        29.6
      ],
      [
        101.62,
        27.23
      ],
      [
        103.51,
        24.76
      ],
      [
        105.22,
        22.21
      ],
      [
        106.77,
        19.59
      ],
      [
        108.18,
        16.9
      ],
      [
        109.45,
        14.17
      ],
      [
        110.6,
        11.39
      ],
      [
        111.66,
        8.58
      ],
      [
        112.62,
        5.74
      ],
      [
        113.49,
        2.88
      ],
      [
        114.32,
        0
      ]
    ]
  },
  {
    "id": "FR935Q",
    "kind": "plane",
    "callsign": "RYR935Q",
    "flight": "FR935Q",
    "airline": "Ryanair",
    "airlineIcao": "RYR",
    "origin": "ALC",
    "originCity": "Alicante",
    "destination": "STN",
    "destinationCity": "London",
    "departUtc": "11:23",
    "arriveUtc": "13:37",
    "aircraftType": "B38M",
    "aircraftTypeName": "Boeing 737 MAX 8",
    "registration": "9H-VVM",
    "altitudeFt": 12925,
    "speedKt": 349,
    "trackDeg": 25,
    "lat": 51.667724,
    "lon": -0.170059,
    "distanceKm": 20.7,
    "azimuthDeg": 25.7,
    "realElevationDeg": 11.2,
    "skyElevationDeg": 52.7,
    "bearingToOriginDeg": 181,
    "bearingToDestDeg": 49,
    "colors": [
      "#EBEDF2",
      "#8FB4E8"
    ],
    "departedAgoMin": 121,
    "arrivingInMin": 13,
    "skyAzimuthDeg": 25.7,
    "skyPathPast": [
      [
        159.98,
        0
      ],
      [
        158.99,
        2.59
      ],
      [
        157.97,
        5.19
      ],
      [
        156.87,
        7.76
      ],
      [
        155.67,
        10.28
      ],
      [
        154.37,
        12.77
      ],
      [
        152.97,
        15.2
      ],
      [
        151.45,
        17.58
      ],
      [
        149.79,
        19.89
      ],
      [
        148,
        22.12
      ],
      [
        146.06,
        24.27
      ],
      [
        143.97,
        26.32
      ],
      [
        141.72,
        28.27
      ],
      [
        139.19,
        30.14
      ],
      [
        136.1,
        32.05
      ],
      [
        132.48,
        33.96
      ],
      [
        128.38,
        35.86
      ],
      [
        123.83,
        37.74
      ],
      [
        118.91,
        39.58
      ],
      [
        113.64,
        41.36
      ],
      [
        108.08,
        43.07
      ],
      [
        102.29,
        44.7
      ],
      [
        96.32,
        46.26
      ],
      [
        90.22,
        47.71
      ],
      [
        84.03,
        49.05
      ],
      [
        77.82,
        50.26
      ],
      [
        71.64,
        51.35
      ],
      [
        65.55,
        52.29
      ],
      [
        59.57,
        53.07
      ],
      [
        53.78,
        53.68
      ],
      [
        48.22,
        54.09
      ],
      [
        42.94,
        54.3
      ],
      [
        37.99,
        54.28
      ],
      [
        33.44,
        54.02
      ],
      [
        29.32,
        53.5
      ],
      [
        25.7,
        52.7
      ]
    ],
    "skyPathAhead": [
      [
        25.7,
        52.7
      ],
      [
        24.32,
        52.16
      ],
      [
        23.37,
        51.43
      ],
      [
        22.79,
        50.55
      ],
      [
        22.58,
        49.51
      ],
      [
        22.69,
        48.33
      ],
      [
        23.06,
        47.03
      ],
      [
        23.68,
        45.62
      ],
      [
        24.5,
        44.12
      ],
      [
        25.48,
        42.54
      ],
      [
        27.05,
        40.58
      ],
      [
        29.13,
        38.38
      ],
      [
        31.22,
        36.16
      ],
      [
        33.28,
        33.95
      ],
      [
        35.29,
        31.77
      ],
      [
        37.21,
        29.62
      ],
      [
        38.99,
        27.54
      ],
      [
        40.6,
        25.51
      ],
      [
        41.99,
        23.56
      ],
      [
        43.14,
        21.7
      ],
      [
        43.99,
        19.97
      ],
      [
        44.52,
        18.35
      ],
      [
        44.68,
        16.86
      ],
      [
        44.44,
        15.53
      ],
      [
        44.09,
        14.24
      ],
      [
        43.75,
        12.95
      ],
      [
        43.41,
        11.66
      ],
      [
        43.07,
        10.37
      ],
      [
        42.74,
        9.07
      ],
      [
        42.41,
        7.78
      ],
      [
        42.09,
        6.48
      ],
      [
        41.77,
        5.19
      ],
      [
        41.45,
        3.89
      ],
      [
        41.14,
        2.6
      ],
      [
        40.84,
        1.3
      ],
      [
        40.53,
        0
      ]
    ]
  },
  {
    "id": "LX29K",
    "kind": "plane",
    "callsign": "SWR29K",
    "flight": "LX29K",
    "airline": "Swiss International Air Lines",
    "airlineIcao": "SWR",
    "origin": "GVA",
    "originCity": "Geneva",
    "destination": "LHR",
    "destinationCity": "London",
    "departUtc": "12:15",
    "arriveUtc": "13:36",
    "aircraftType": "BCS3",
    "aircraftTypeName": "Airbus A220-300",
    "registration": "HB-JCM",
    "altitudeFt": 7450,
    "speedKt": 224,
    "trackDeg": 264,
    "lat": 51.322495,
    "lon": -0.038601,
    "distanceKm": 26.8,
    "azimuthDeg": 137.3,
    "realElevationDeg": 5.2,
    "skyElevationDeg": 48.3,
    "bearingToOriginDeg": 139,
    "bearingToDestDeg": 299,
    "colors": [
      "#EBEDF2",
      "#8FB4E8"
    ],
    "departedAgoMin": 69,
    "arrivingInMin": 12,
    "skyAzimuthDeg": 137.3,
    "skyPathPast": [
      [
        144.59,
        0
      ],
      [
        144.72,
        1.39
      ],
      [
        144.87,
        2.78
      ],
      [
        145.02,
        4.17
      ],
      [
        145.17,
        5.56
      ],
      [
        145.33,
        6.95
      ],
      [
        145.51,
        8.34
      ],
      [
        145.68,
        9.72
      ],
      [
        145.87,
        11.11
      ],
      [
        146.07,
        12.5
      ],
      [
        146.27,
        13.88
      ],
      [
        146.49,
        15.26
      ],
      [
        146.72,
        16.64
      ],
      [
        146.89,
        18.02
      ],
      [
        146.85,
        19.42
      ],
      [
        146.59,
        20.83
      ],
      [
        146.16,
        22.26
      ],
      [
        145.58,
        23.68
      ],
      [
        144.86,
        25.11
      ],
      [
        144.03,
        26.56
      ],
      [
        143.12,
        28
      ],
      [
        142.15,
        29.44
      ],
      [
        141.16,
        30.88
      ],
      [
        140.15,
        32.33
      ],
      [
        139.17,
        33.77
      ],
      [
        138.23,
        35.19
      ],
      [
        137.35,
        36.61
      ],
      [
        136.58,
        38.01
      ],
      [
        135.94,
        39.39
      ],
      [
        135.44,
        40.76
      ],
      [
        135.13,
        42.1
      ],
      [
        135.03,
        43.41
      ],
      [
        135.16,
        44.7
      ],
      [
        135.57,
        45.94
      ],
      [
        136.27,
        47.14
      ],
      [
        137.3,
        48.3
      ]
    ],
    "skyPathAhead": [
      [
        137.3,
        48.3
      ],
      [
        140.25,
        50.62
      ],
      [
        143.92,
        52.71
      ],
      [
        146.8,
        51.33
      ],
      [
        149.39,
        48.54
      ],
      [
        152.3,
        45.82
      ],
      [
        155.49,
        43.19
      ],
      [
        158.96,
        40.65
      ],
      [
        162.64,
        38.24
      ],
      [
        166.5,
        35.93
      ],
      [
        170.52,
        33.75
      ],
      [
        174.65,
        31.7
      ],
      [
        178.83,
        29.75
      ],
      [
        183.06,
        27.92
      ],
      [
        187.27,
        26.19
      ],
      [
        191.46,
        24.56
      ],
      [
        195.58,
        23.01
      ],
      [
        199.6,
        21.53
      ],
      [
        203.51,
        20.12
      ],
      [
        207.27,
        18.79
      ],
      [
        210.84,
        17.5
      ],
      [
        214.24,
        16.25
      ],
      [
        217.4,
        15.06
      ],
      [
        220.33,
        13.91
      ],
      [
        223.18,
        12.77
      ],
      [
        226.02,
        11.65
      ],
      [
        228.85,
        10.54
      ],
      [
        231.68,
        9.43
      ],
      [
        234.49,
        8.32
      ],
      [
        237.3,
        7.19
      ],
      [
        240.09,
        6.06
      ],
      [
        242.87,
        4.91
      ],
      [
        245.63,
        3.73
      ],
      [
        248.37,
        2.52
      ],
      [
        251.1,
        1.28
      ],
      [
        253.81,
        0
      ]
    ]
  },
  {
    "id": "EY69W",
    "kind": "plane",
    "callsign": "ETD69W",
    "flight": "EY69W",
    "airline": "Etihad Airways",
    "airlineIcao": "ETD",
    "origin": "AUH",
    "originCity": "Abu Dhabi",
    "destination": "LHR",
    "destinationCity": "London",
    "departUtc": "06:51",
    "arriveUtc": "13:36",
    "aircraftType": "A35K",
    "aircraftTypeName": "Airbus A350-1000",
    "registration": "A6-XWI",
    "altitudeFt": 5650,
    "speedKt": 295,
    "trackDeg": 126,
    "lat": 51.562385,
    "lon": -0.013394,
    "distanceKm": 21,
    "azimuthDeg": 70.6,
    "realElevationDeg": 4.7,
    "skyElevationDeg": 52.5,
    "bearingToOriginDeg": 102,
    "bearingToDestDeg": 252,
    "colors": [
      "#EBEDF2",
      "#8FB4E8"
    ],
    "departedAgoMin": 393,
    "arrivingInMin": 12,
    "skyAzimuthDeg": 70.6,
    "skyPathPast": [
      [
        104.8,
        0
      ],
      [
        104.9,
        1.58
      ],
      [
        104.98,
        3.16
      ],
      [
        105.07,
        4.75
      ],
      [
        105.16,
        6.33
      ],
      [
        105.26,
        7.91
      ],
      [
        105.37,
        9.49
      ],
      [
        105.47,
        11.07
      ],
      [
        105.59,
        12.65
      ],
      [
        105.71,
        14.23
      ],
      [
        105.84,
        15.81
      ],
      [
        105.98,
        17.39
      ],
      [
        106.12,
        18.97
      ],
      [
        106.13,
        20.55
      ],
      [
        105.65,
        22.1
      ],
      [
        104.71,
        23.64
      ],
      [
        103.37,
        25.17
      ],
      [
        101.68,
        26.68
      ],
      [
        99.68,
        28.18
      ],
      [
        97.42,
        29.67
      ],
      [
        94.97,
        31.16
      ],
      [
        92.37,
        32.62
      ],
      [
        89.66,
        34.09
      ],
      [
        86.9,
        35.55
      ],
      [
        84.14,
        37
      ],
      [
        81.45,
        38.46
      ],
      [
        78.87,
        39.9
      ],
      [
        76.45,
        41.35
      ],
      [
        74.27,
        42.79
      ],
      [
        72.36,
        44.21
      ],
      [
        70.81,
        45.64
      ],
      [
        69.67,
        47.06
      ],
      [
        69.01,
        48.46
      ],
      [
        68.9,
        49.84
      ],
      [
        69.4,
        51.19
      ],
      [
        70.6,
        52.5
      ]
    ],
    "skyPathAhead": [
      [
        70.6,
        52.5
      ],
      [
        75.46,
        55.42
      ],
      [
        79.03,
        52.5
      ],
      [
        83.07,
        49.04
      ],
      [
        87.97,
        45.85
      ],
      [
        93.57,
        42.94
      ],
      [
        99.8,
        40.38
      ],
      [
        106.5,
        38.17
      ],
      [
        113.52,
        36.24
      ],
      [
        120.78,
        34.57
      ],
      [
        128.18,
        33.13
      ],
      [
        135.64,
        31.8
      ],
      [
        143.11,
        30.62
      ],
      [
        150.54,
        29.54
      ],
      [
        157.86,
        28.52
      ],
      [
        165.03,
        27.57
      ],
      [
        171.99,
        26.64
      ],
      [
        178.71,
        25.74
      ],
      [
        185.12,
        24.86
      ],
      [
        191.2,
        23.97
      ],
      [
        196.85,
        23.07
      ],
      [
        202.08,
        22.15
      ],
      [
        206.78,
        21.19
      ],
      [
        210.97,
        20.19
      ],
      [
        214.96,
        19.13
      ],
      [
        218.91,
        18.03
      ],
      [
        222.81,
        16.85
      ],
      [
        226.67,
        15.62
      ],
      [
        230.45,
        14.24
      ],
      [
        234.17,
        12.78
      ],
      [
        237.81,
        11.17
      ],
      [
        241.32,
        9.36
      ],
      [
        244.71,
        7.36
      ],
      [
        247.94,
        5.15
      ],
      [
        250.98,
        2.69
      ],
      [
        253.81,
        0
      ]
    ]
  },
  {
    "id": "AY96W",
    "kind": "plane",
    "callsign": "FIN96W",
    "flight": "AY96W",
    "airline": "Finnair",
    "airlineIcao": "FIN",
    "origin": "HEL",
    "originCity": "Helsinki",
    "destination": "LIS",
    "destinationCity": "Lisbon",
    "departUtc": "11:03",
    "arriveUtc": "15:25",
    "aircraftType": "A321",
    "aircraftTypeName": "Airbus A321",
    "registration": "OH-LZK",
    "altitudeFt": 31975,
    "speedKt": 463,
    "trackDeg": 226,
    "lat": 51.845507,
    "lon": 0.334015,
    "distanceKm": 58.2,
    "azimuthDeg": 48.4,
    "realElevationDeg": 9.7,
    "skyElevationDeg": 25.1,
    "bearingToOriginDeg": 48,
    "bearingToDestDeg": 211,
    "colors": [
      "#EBEDF2",
      "#8FB4E8"
    ],
    "departedAgoMin": 141,
    "arrivingInMin": 121,
    "skyAzimuthDeg": 48.4,
    "skyPathPast": [
      [
        121.83,
        0
      ],
      [
        121.84,
        0
      ],
      [
        121.84,
        0
      ],
      [
        121.84,
        0
      ],
      [
        121.85,
        0
      ],
      [
        121.85,
        0
      ],
      [
        121.85,
        0
      ],
      [
        121.86,
        0
      ],
      [
        121.86,
        0
      ],
      [
        121.86,
        0
      ],
      [
        121.87,
        0
      ],
      [
        121.87,
        0
      ],
      [
        121.87,
        0
      ],
      [
        121.65,
        0.08
      ],
      [
        120.64,
        0.42
      ],
      [
        118.92,
        1.01
      ],
      [
        116.54,
        1.82
      ],
      [
        113.61,
        2.83
      ],
      [
        110.17,
        4
      ],
      [
        106.31,
        5.32
      ],
      [
        102.11,
        6.75
      ],
      [
        97.63,
        8.28
      ],
      [
        92.95,
        9.88
      ],
      [
        88.16,
        11.52
      ],
      [
        83.32,
        13.17
      ],
      [
        78.5,
        14.81
      ],
      [
        73.79,
        16.42
      ],
      [
        69.26,
        17.97
      ],
      [
        64.97,
        19.43
      ],
      [
        61.03,
        20.78
      ],
      [
        57.48,
        22
      ],
      [
        54.4,
        23.05
      ],
      [
        51.89,
        23.91
      ],
      [
        50,
        24.55
      ],
      [
        48.8,
        24.96
      ],
      [
        48.4,
        25.1
      ]
    ],
    "skyPathAhead": [
      [
        48.4,
        25.1
      ],
      [
        48.81,
        24.96
      ],
      [
        50.01,
        24.55
      ],
      [
        51.91,
        23.91
      ],
      [
        54.43,
        23.05
      ],
      [
        57.51,
        22
      ],
      [
        61.07,
        20.78
      ],
      [
        65.02,
        19.43
      ],
      [
        69.31,
        17.97
      ],
      [
        73.84,
        16.42
      ],
      [
        78.57,
        14.81
      ],
      [
        83.39,
        13.17
      ],
      [
        88.23,
        11.52
      ],
      [
        93.04,
        9.88
      ],
      [
        97.72,
        8.28
      ],
      [
        102.2,
        6.75
      ],
      [
        106.42,
        5.32
      ],
      [
        110.28,
        4
      ],
      [
        113.72,
        2.83
      ],
      [
        116.67,
        1.82
      ],
      [
        119.05,
        1.01
      ],
      [
        120.77,
        0.42
      ],
      [
        121.79,
        0.08
      ],
      [
        122.02,
        0
      ],
      [
        122.02,
        0
      ],
      [
        122.03,
        0
      ],
      [
        122.03,
        0
      ],
      [
        122.03,
        0
      ],
      [
        122.04,
        0
      ],
      [
        122.04,
        0
      ],
      [
        122.04,
        0
      ],
      [
        122.05,
        0
      ],
      [
        122.05,
        0
      ],
      [
        122.05,
        0
      ],
      [
        122.06,
        0
      ],
      [
        122.06,
        0
      ]
    ]
  },
  {
    "id": "CX257",
    "kind": "plane",
    "callsign": "CPA257",
    "flight": "CX257",
    "airline": "Cathay Pacific",
    "airlineIcao": "CPA",
    "origin": "HKG",
    "originCity": "Hong Kong",
    "destination": "LHR",
    "destinationCity": "London",
    "departUtc": "02:14",
    "arriveUtc": "13:39",
    "aircraftType": "A359",
    "aircraftTypeName": "Airbus A350-900",
    "registration": "B-LRC",
    "altitudeFt": 10950,
    "speedKt": 327,
    "trackDeg": 263,
    "lat": 51.672146,
    "lon": 0.50293,
    "distanceKm": 58.7,
    "azimuthDeg": 70.6,
    "realElevationDeg": 3.4,
    "skyElevationDeg": 24.8,
    "bearingToOriginDeg": 58,
    "bearingToDestDeg": 252,
    "colors": [
      "#EBEDF2",
      "#8FB4E8"
    ],
    "departedAgoMin": 671,
    "arrivingInMin": 15,
    "skyAzimuthDeg": 70.6,
    "skyPathPast": [
      [
        55.72,
        0
      ],
      [
        55.67,
        0.72
      ],
      [
        55.65,
        1.45
      ],
      [
        55.63,
        2.17
      ],
      [
        55.61,
        2.9
      ],
      [
        55.58,
        3.62
      ],
      [
        55.56,
        4.35
      ],
      [
        55.53,
        5.07
      ],
      [
        55.51,
        5.8
      ],
      [
        55.48,
        6.52
      ],
      [
        55.46,
        7.25
      ],
      [
        55.43,
        7.97
      ],
      [
        55.4,
        8.69
      ],
      [
        55.42,
        9.42
      ],
      [
        55.61,
        10.13
      ],
      [
        55.96,
        10.85
      ],
      [
        56.45,
        11.55
      ],
      [
        57.06,
        12.26
      ],
      [
        57.79,
        12.95
      ],
      [
        58.6,
        13.64
      ],
      [
        59.48,
        14.34
      ],
      [
        60.43,
        15.03
      ],
      [
        61.42,
        15.72
      ],
      [
        62.43,
        16.41
      ],
      [
        63.45,
        17.1
      ],
      [
        64.47,
        17.79
      ],
      [
        65.45,
        18.47
      ],
      [
        66.41,
        19.17
      ],
      [
        67.31,
        19.85
      ],
      [
        68.13,
        20.55
      ],
      [
        68.86,
        21.25
      ],
      [
        69.48,
        21.95
      ],
      [
        69.98,
        22.66
      ],
      [
        70.35,
        23.36
      ],
      [
        70.56,
        24.07
      ],
      [
        70.6,
        24.8
      ]
    ],
    "skyPathAhead": [
      [
        70.6,
        24.8
      ],
      [
        70.05,
        30.18
      ],
      [
        69.17,
        35.56
      ],
      [
        67.88,
        40.93
      ],
      [
        66.01,
        39.03
      ],
      [
        63.88,
        33.79
      ],
      [
        60.91,
        28.75
      ],
      [
        56.77,
        24.28
      ],
      [
        51.41,
        20.82
      ],
      [
        45.29,
        18.45
      ],
      [
        38.86,
        16.87
      ],
      [
        32.32,
        15.67
      ],
      [
        25.73,
        14.92
      ],
      [
        19.15,
        14.17
      ],
      [
        12.59,
        13.72
      ],
      [
        6.08,
        13.27
      ],
      [
        359.63,
        12.81
      ],
      [
        353.27,
        12.46
      ],
      [
        347.01,
        12.15
      ],
      [
        340.86,
        11.84
      ],
      [
        334.83,
        11.53
      ],
      [
        328.94,
        11.2
      ],
      [
        323.24,
        10.88
      ],
      [
        317.72,
        10.55
      ],
      [
        312.24,
        10.22
      ],
      [
        306.76,
        9.89
      ],
      [
        301.29,
        9.55
      ],
      [
        295.85,
        9.08
      ],
      [
        290.41,
        8.61
      ],
      [
        284.97,
        8.14
      ],
      [
        279.57,
        7.48
      ],
      [
        274.18,
        6.73
      ],
      [
        268.85,
        5.75
      ],
      [
        263.59,
        4.47
      ],
      [
        258.51,
        2.62
      ],
      [
        253.81,
        0
      ]
    ]
  },
  {
    "id": "BY8AB",
    "kind": "plane",
    "callsign": "TOM8AB",
    "flight": "BY8AB",
    "airline": "TUI Airways",
    "airlineIcao": "TOM",
    "origin": "ACE",
    "originCity": "Lanzarote Island",
    "destination": "LTN",
    "destinationCity": "London",
    "departUtc": "09:57",
    "arriveUtc": "13:36",
    "aircraftType": "B38M",
    "aircraftTypeName": "Boeing 737 MAX 8",
    "registration": "G-TUPH",
    "altitudeFt": 31025,
    "speedKt": 498,
    "trackDeg": 137,
    "lat": 51.687653,
    "lon": -0.342135,
    "distanceKm": 21.1,
    "azimuthDeg": 352.1,
    "realElevationDeg": 24.7,
    "skyElevationDeg": 61.5,
    "bearingToOriginDeg": 209,
    "bearingToDestDeg": 355,
    "colors": [
      "#EBEDF2",
      "#8FB4E8"
    ],
    "departedAgoMin": 208,
    "arrivingInMin": 11,
    "skyAzimuthDeg": 356.1,
    "skyPathPast": [
      [
        223.38,
        0
      ],
      [
        224.14,
        2.91
      ],
      [
        224.9,
        5.85
      ],
      [
        225.74,
        8.77
      ],
      [
        226.66,
        11.67
      ],
      [
        227.68,
        14.53
      ],
      [
        228.8,
        17.37
      ],
      [
        230.05,
        20.16
      ],
      [
        231.44,
        22.91
      ],
      [
        232.99,
        25.59
      ],
      [
        234.73,
        28.2
      ],
      [
        236.66,
        30.73
      ],
      [
        238.82,
        33.15
      ],
      [
        241.29,
        35.49
      ],
      [
        244.26,
        37.85
      ],
      [
        247.72,
        40.2
      ],
      [
        251.64,
        42.51
      ],
      [
        255.98,
        44.76
      ],
      [
        260.73,
        46.92
      ],
      [
        265.82,
        48.99
      ],
      [
        271.2,
        50.95
      ],
      [
        276.85,
        52.79
      ],
      [
        282.69,
        54.52
      ],
      [
        288.69,
        56.12
      ],
      [
        294.78,
        57.6
      ],
      [
        300.93,
        58.93
      ],
      [
        307.11,
        60.12
      ],
      [
        313.25,
        61.14
      ],
      [
        319.31,
        61.99
      ],
      [
        325.27,
        62.65
      ],
      [
        331.07,
        63.11
      ],
      [
        336.66,
        63.34
      ],
      [
        342.01,
        63.3
      ],
      [
        347.06,
        63.01
      ],
      [
        351.77,
        62.42
      ],
      [
        356.1,
        61.5
      ]
    ],
    "skyPathAhead": [
      [
        356.1,
        61.5
      ],
      [
        357.94,
        60.87
      ],
      [
        359.51,
        60.03
      ],
      [
        0.81,
        59
      ],
      [
        1.86,
        57.82
      ],
      [
        2.48,
        56.33
      ],
      [
        1.84,
        54.17
      ],
      [
        1.06,
        51.92
      ],
      [
        0.19,
        49.61
      ],
      [
        359.22,
        47.24
      ],
      [
        358.19,
        44.84
      ],
      [
        357.13,
        42.42
      ],
      [
        356.06,
        39.99
      ],
      [
        354.98,
        37.57
      ],
      [
        353.94,
        35.18
      ],
      [
        352.95,
        32.83
      ],
      [
        352.05,
        30.53
      ],
      [
        351.24,
        28.3
      ],
      [
        350.56,
        26.17
      ],
      [
        350.02,
        24.12
      ],
      [
        349.65,
        22.21
      ],
      [
        349.48,
        20.41
      ],
      [
        349.52,
        18.78
      ],
      [
        349.8,
        17.29
      ],
      [
        350.14,
        15.85
      ],
      [
        350.47,
        14.41
      ],
      [
        350.8,
        12.98
      ],
      [
        351.13,
        11.54
      ],
      [
        351.45,
        10.1
      ],
      [
        351.77,
        8.66
      ],
      [
        352.08,
        7.22
      ],
      [
        352.39,
        5.77
      ],
      [
        352.69,
        4.33
      ],
      [
        352.99,
        2.89
      ],
      [
        353.29,
        1.44
      ],
      [
        353.58,
        0
      ]
    ]
  },
  {
    "id": "DL81",
    "kind": "plane",
    "callsign": "DAL81",
    "flight": "DL81",
    "airline": "Delta Air Lines",
    "airlineIcao": "DAL",
    "origin": "CDG",
    "originCity": "Paris",
    "destination": "SEA",
    "destinationCity": "Seattle",
    "departUtc": "12:40",
    "arriveUtc": "22:18",
    "aircraftType": "A339",
    "aircraftTypeName": "Airbus A330-900neo",
    "registration": "N403DX",
    "altitudeFt": 31000,
    "speedKt": 441,
    "trackDeg": 328,
    "lat": 51.887078,
    "lon": 0.35614,
    "distanceKm": 62.4,
    "azimuthDeg": 46.2,
    "realElevationDeg": 8.8,
    "skyElevationDeg": 40,
    "bearingToOriginDeg": 153,
    "bearingToDestDeg": 322,
    "colors": [
      "#EBEDF2",
      "#8FB4E8"
    ],
    "departedAgoMin": 44,
    "arrivingInMin": 534,
    "skyAzimuthDeg": 54.2,
    "skyPathPast": [
      [
        143.92,
        0
      ],
      [
        144.03,
        3.7
      ],
      [
        144.15,
        7.41
      ],
      [
        144.27,
        11.11
      ],
      [
        144.42,
        14.81
      ],
      [
        144.58,
        18.52
      ],
      [
        144.77,
        22.22
      ],
      [
        145,
        25.92
      ],
      [
        145.27,
        29.62
      ],
      [
        145.6,
        33.31
      ],
      [
        146,
        37
      ],
      [
        146.52,
        40.69
      ],
      [
        147.19,
        44.36
      ],
      [
        148.43,
        47.95
      ],
      [
        151.17,
        51.31
      ],
      [
        155.6,
        54.39
      ],
      [
        162.12,
        57.06
      ],
      [
        171.32,
        59.03
      ],
      [
        183.02,
        60.04
      ],
      [
        196.43,
        60.2
      ],
      [
        210.84,
        59.87
      ],
      [
        225.96,
        59.17
      ],
      [
        241.5,
        58.3
      ],
      [
        257.33,
        57.27
      ],
      [
        273.24,
        56.24
      ],
      [
        289.22,
        55.03
      ],
      [
        305.05,
        53.85
      ],
      [
        320.62,
        52.71
      ],
      [
        335.73,
        51.46
      ],
      [
        350.39,
        50.31
      ],
      [
        4.32,
        49.12
      ],
      [
        17.46,
        47.94
      ],
      [
        29.47,
        46.59
      ],
      [
        40.08,
        44.97
      ],
      [
        48.59,
        42.8
      ],
      [
        54.2,
        40
      ]
    ],
    "skyPathAhead": [
      [
        54.2,
        40
      ],
      [
        55.23,
        38.64
      ],
      [
        54.87,
        37.42
      ],
      [
        53.24,
        36.32
      ],
      [
        50.52,
        35.34
      ],
      [
        46.87,
        34.47
      ],
      [
        42.42,
        33.7
      ],
      [
        37.29,
        33.03
      ],
      [
        31.65,
        32.44
      ],
      [
        25.58,
        31.9
      ],
      [
        19.21,
        31.4
      ],
      [
        12.66,
        30.93
      ],
      [
        6.03,
        30.46
      ],
      [
        359.45,
        29.97
      ],
      [
        353.01,
        29.45
      ],
      [
        346.84,
        28.89
      ],
      [
        341.03,
        28.25
      ],
      [
        335.7,
        27.53
      ],
      [
        330.95,
        26.7
      ],
      [
        326.9,
        25.74
      ],
      [
        323.65,
        24.65
      ],
      [
        321.31,
        23.39
      ],
      [
        319.98,
        21.95
      ],
      [
        319.74,
        20.31
      ],
      [
        319.82,
        18.62
      ],
      [
        319.9,
        16.93
      ],
      [
        319.97,
        15.24
      ],
      [
        320.04,
        13.54
      ],
      [
        320.11,
        11.85
      ],
      [
        320.17,
        10.16
      ],
      [
        320.23,
        8.47
      ],
      [
        320.28,
        6.77
      ],
      [
        320.33,
        5.08
      ],
      [
        320.38,
        3.39
      ],
      [
        320.43,
        1.69
      ],
      [
        320.49,
        0
      ]
    ]
  },
  {
    "id": "VLZ05",
    "kind": "helicopter",
    "callsign": "VLZ05",
    "flight": "VLZ05",
    "airline": "Private operator",
    "airlineIcao": "",
    "origin": "LCL",
    "originCity": "Local flight",
    "destination": "LCL",
    "destinationCity": "Local flight",
    "departUtc": "--:--",
    "arriveUtc": "--:--",
    "aircraftType": "A109",
    "aircraftTypeName": "Leonardo AW109",
    "registration": "2-SLOW",
    "altitudeFt": 800,
    "speedKt": 147,
    "trackDeg": 170,
    "lat": 51.436707,
    "lon": -0.666083,
    "distanceKm": 26.3,
    "azimuthDeg": 254.6,
    "realElevationDeg": 0.5,
    "skyElevationDeg": 59.4,
    "bearingToOriginDeg": 350,
    "bearingToDestDeg": 170,
    "colors": [
      "#FFB347",
      "#FFFFFF"
    ],
    "departedAgoMin": 0,
    "arrivingInMin": 0,
    "skyAzimuthDeg": 262.6,
    "skyPathPast": [
      [
        299.55,
        37.75
      ],
      [
        297.74,
        38.18
      ],
      [
        295.92,
        38.67
      ],
      [
        294.13,
        39.18
      ],
      [
        292.34,
        39.74
      ],
      [
        290.58,
        40.33
      ],
      [
        288.82,
        40.98
      ],
      [
        287.09,
        41.66
      ],
      [
        285.38,
        42.39
      ],
      [
        283.68,
        43.17
      ],
      [
        282.01,
        44
      ],
      [
        280.36,
        44.88
      ],
      [
        278.73,
        45.8
      ],
      [
        277.13,
        46.78
      ],
      [
        275.55,
        47.81
      ],
      [
        274,
        48.89
      ],
      [
        272.47,
        50.01
      ],
      [
        270.97,
        51.2
      ],
      [
        269.51,
        52.43
      ],
      [
        268.06,
        53.71
      ],
      [
        266.65,
        55.06
      ],
      [
        265.27,
        56.45
      ],
      [
        263.92,
        57.9
      ],
      [
        262.6,
        59.4
      ]
    ],
    "skyPathAhead": []
  },
  {
    "id": "GUIDO",
    "kind": "helicopter",
    "callsign": "GUIDO",
    "flight": "GUIDO",
    "airline": "Private (G-UIDO)",
    "airlineIcao": "",
    "origin": "LCL",
    "originCity": "Local flight",
    "destination": "LCL",
    "destinationCity": "Local flight",
    "departUtc": "--:--",
    "arriveUtc": "--:--",
    "aircraftType": "R22",
    "aircraftTypeName": "Robinson R22",
    "registration": "G-UIDO",
    "altitudeFt": 1300,
    "speedKt": 72,
    "trackDeg": 43,
    "lat": 51.237255,
    "lon": 0.264511,
    "distanceKm": 48.9,
    "azimuthDeg": 126.5,
    "realElevationDeg": 0.5,
    "skyElevationDeg": 30.5,
    "bearingToOriginDeg": 223,
    "bearingToDestDeg": 43,
    "colors": [
      "#FFB347",
      "#FFFFFF"
    ],
    "departedAgoMin": 0,
    "arrivingInMin": 0,
    "skyAzimuthDeg": 126.5,
    "skyPathPast": [
      [
        153.73,
        28.95
      ],
      [
        152.58,
        29.14
      ],
      [
        151.42,
        29.32
      ],
      [
        150.25,
        29.48
      ],
      [
        149.08,
        29.64
      ],
      [
        147.91,
        29.78
      ],
      [
        146.74,
        29.91
      ],
      [
        145.56,
        30.03
      ],
      [
        144.38,
        30.14
      ],
      [
        143.19,
        30.23
      ],
      [
        142.01,
        30.32
      ],
      [
        140.82,
        30.4
      ],
      [
        139.63,
        30.46
      ],
      [
        138.44,
        30.52
      ],
      [
        137.25,
        30.56
      ],
      [
        136.05,
        30.59
      ],
      [
        134.86,
        30.61
      ],
      [
        133.66,
        30.63
      ],
      [
        132.47,
        30.63
      ],
      [
        131.27,
        30.63
      ],
      [
        130.08,
        30.61
      ],
      [
        128.89,
        30.59
      ],
      [
        127.69,
        30.55
      ],
      [
        126.5,
        30.5
      ]
    ],
    "skyPathAhead": []
  },
  {
    "id": "SAT25544",
    "kind": "satellite",
    "callsign": "ISS (ZARYA)",
    "flight": "NORAD 25544",
    "airline": "NASA / Roscosmos / ESA / JAXA / CSA",
    "airlineIcao": "",
    "origin": "ORB",
    "originCity": "Low Earth orbit",
    "destination": "ORB",
    "destinationCity": "Low Earth orbit",
    "departUtc": "--:--",
    "arriveUtc": "--:--",
    "aircraftType": "ISS",
    "aircraftTypeName": "Space station",
    "registration": "ISS (ZARYA)",
    "altitudeFt": 1414728,
    "altitudeKm": 431,
    "speedKt": 14875,
    "trackDeg": 140,
    "lat": 23.27,
    "lon": -74.24,
    "distanceKm": 6808,
    "azimuthDeg": 273,
    "realElevationDeg": -28,
    "skyElevationDeg": 52.8,
    "bearingToOriginDeg": 320,
    "bearingToDestDeg": 140,
    "tle": [
      "1 25544U 98067A   26300.82187419  .00005456  00000+0  10681-3 0  9999",
      "2 25544  51.6336   3.7485 0007015 317.3678  42.6766 15.49080514592319"
    ],
    "colors": [
      "#E8C55A",
      "#5CE1FF"
    ],
    "departedAgoMin": 0,
    "arrivingInMin": 0,
    "skyAzimuthDeg": 277,
    "skyPathPast": [
      [
        329.99,
        42.89
      ],
      [
        328.05,
        42.99
      ],
      [
        326.13,
        43.11
      ],
      [
        324.21,
        43.25
      ],
      [
        322.3,
        43.4
      ],
      [
        320.39,
        43.57
      ],
      [
        318.49,
        43.76
      ],
      [
        316.59,
        43.96
      ],
      [
        314.71,
        44.18
      ],
      [
        312.84,
        44.42
      ],
      [
        310.97,
        44.67
      ],
      [
        309.1,
        44.95
      ],
      [
        307.24,
        45.23
      ],
      [
        305.39,
        45.54
      ],
      [
        303.55,
        45.86
      ],
      [
        301.72,
        46.2
      ],
      [
        299.9,
        46.56
      ],
      [
        298.08,
        46.94
      ],
      [
        296.28,
        47.33
      ],
      [
        294.49,
        47.74
      ],
      [
        292.7,
        48.17
      ],
      [
        290.92,
        48.62
      ],
      [
        289.15,
        49.08
      ],
      [
        287.4,
        49.56
      ],
      [
        285.65,
        50.05
      ],
      [
        283.9,
        50.57
      ],
      [
        282.18,
        51.09
      ],
      [
        280.46,
        51.65
      ],
      [
        278.75,
        52.21
      ],
      [
        277.05,
        52.8
      ]
    ],
    "skyPathAhead": [
      [
        277.05,
        52.8
      ],
      [
        274.94,
        52.16
      ],
      [
        272.83,
        51.54
      ],
      [
        270.74,
        50.93
      ],
      [
        268.66,
        50.35
      ],
      [
        266.59,
        49.78
      ],
      [
        264.53,
        49.23
      ],
      [
        262.48,
        48.7
      ],
      [
        260.44,
        48.19
      ],
      [
        258.41,
        47.7
      ],
      [
        256.4,
        47.22
      ],
      [
        254.39,
        46.76
      ],
      [
        252.4,
        46.32
      ],
      [
        250.43,
        45.89
      ],
      [
        248.46,
        45.49
      ],
      [
        246.5,
        45.11
      ],
      [
        244.55,
        44.74
      ],
      [
        242.62,
        44.39
      ],
      [
        240.71,
        44.07
      ],
      [
        238.8,
        43.75
      ],
      [
        236.91,
        43.46
      ],
      [
        235.01,
        43.19
      ],
      [
        233.14,
        42.94
      ],
      [
        231.29,
        42.71
      ],
      [
        229.44,
        42.49
      ],
      [
        227.61,
        42.29
      ],
      [
        225.79,
        42.12
      ],
      [
        223.98,
        41.96
      ],
      [
        222.18,
        41.83
      ],
      [
        220.4,
        41.71
      ]
    ]
  },
  {
    "id": "SAT20580",
    "kind": "satellite",
    "callsign": "HST",
    "flight": "NORAD 20580",
    "airline": "NASA / ESA",
    "airlineIcao": "",
    "origin": "ORB",
    "originCity": "Low Earth orbit",
    "destination": "ORB",
    "destinationCity": "Low Earth orbit",
    "departUtc": "--:--",
    "arriveUtc": "--:--",
    "aircraftType": "HST",
    "aircraftTypeName": "Space telescope",
    "registration": "HST",
    "altitudeFt": 1563548,
    "altitudeKm": 477,
    "speedKt": 14831,
    "trackDeg": 95,
    "lat": 28.15,
    "lon": 113.57,
    "distanceKm": 8640,
    "azimuthDeg": 54.6,
    "realElevationDeg": -38.4,
    "skyElevationDeg": 50.5,
    "bearingToOriginDeg": 275,
    "bearingToDestDeg": 95,
    "tle": [
      "1 20580U 90037B   26300.95357625  .00004578  00000+0  13616-3 0  9990",
      "2 20580  28.4737 252.2364 0001925 183.4227 176.6356 15.32101084808944"
    ],
    "colors": [
      "#E8C55A",
      "#5CE1FF"
    ],
    "departedAgoMin": 0,
    "arrivingInMin": 0,
    "skyAzimuthDeg": 58.6,
    "skyPathPast": [
      [
        101.99,
        44.69
      ],
      [
        100.32,
        44.64
      ],
      [
        98.66,
        44.61
      ],
      [
        97.01,
        44.6
      ],
      [
        95.38,
        44.6
      ],
      [
        93.75,
        44.63
      ],
      [
        92.14,
        44.67
      ],
      [
        90.54,
        44.73
      ],
      [
        88.95,
        44.8
      ],
      [
        87.38,
        44.89
      ],
      [
        85.82,
        45
      ],
      [
        84.27,
        45.13
      ],
      [
        82.72,
        45.28
      ],
      [
        81.2,
        45.43
      ],
      [
        79.68,
        45.62
      ],
      [
        78.19,
        45.82
      ],
      [
        76.7,
        46.04
      ],
      [
        75.22,
        46.27
      ],
      [
        73.77,
        46.52
      ],
      [
        72.33,
        46.8
      ],
      [
        70.89,
        47.08
      ],
      [
        69.47,
        47.38
      ],
      [
        68.06,
        47.71
      ],
      [
        66.68,
        48.05
      ],
      [
        65.29,
        48.41
      ],
      [
        63.92,
        48.79
      ],
      [
        62.58,
        49.19
      ],
      [
        61.24,
        49.61
      ],
      [
        59.92,
        50.05
      ],
      [
        58.6,
        50.5
      ]
    ],
    "skyPathAhead": [
      [
        58.6,
        50.5
      ],
      [
        56.94,
        49.75
      ],
      [
        55.28,
        49.02
      ],
      [
        53.64,
        48.31
      ],
      [
        52,
        47.61
      ],
      [
        50.39,
        46.94
      ],
      [
        48.78,
        46.3
      ],
      [
        47.19,
        45.67
      ],
      [
        45.61,
        45.06
      ],
      [
        44.04,
        44.47
      ],
      [
        42.49,
        43.92
      ],
      [
        40.94,
        43.37
      ],
      [
        39.4,
        42.85
      ],
      [
        37.89,
        42.36
      ],
      [
        36.38,
        41.89
      ],
      [
        34.89,
        41.43
      ],
      [
        33.4,
        41
      ],
      [
        31.93,
        40.6
      ],
      [
        30.48,
        40.22
      ],
      [
        29.03,
        39.85
      ],
      [
        27.6,
        39.52
      ],
      [
        26.16,
        39.22
      ],
      [
        24.75,
        38.93
      ],
      [
        23.35,
        38.67
      ],
      [
        21.97,
        38.42
      ],
      [
        20.59,
        38.21
      ],
      [
        19.22,
        38.02
      ],
      [
        17.86,
        37.85
      ],
      [
        16.51,
        37.71
      ],
      [
        15.18,
        37.59
      ]
    ]
  },
  {
    "id": "SAT48274",
    "kind": "satellite",
    "callsign": "CSS (TIANHE)",
    "flight": "NORAD 48274",
    "airline": "CMSA (China)",
    "airlineIcao": "",
    "origin": "ORB",
    "originCity": "Low Earth orbit",
    "destination": "ORB",
    "destinationCity": "Low Earth orbit",
    "departUtc": "--:--",
    "arriveUtc": "--:--",
    "aircraftType": "CSS",
    "aircraftTypeName": "Space station core module",
    "registration": "CSS (TIANHE)",
    "altitudeFt": 1291231,
    "altitudeKm": 394,
    "speedKt": 14919,
    "trackDeg": 53,
    "lat": 23.61,
    "lon": 27.63,
    "distanceKm": 3987,
    "azimuthDeg": 131.8,
    "realElevationDeg": -12.2,
    "skyElevationDeg": 65.3,
    "bearingToOriginDeg": 233,
    "bearingToDestDeg": 53,
    "tle": [
      "1 48274U 21035A   26300.84762791  .00006899  00000+0  83028-4 0  9997",
      "2 48274  41.4695 236.0745 0003391 226.0973 133.9587 15.61208696313881"
    ],
    "colors": [
      "#E8C55A",
      "#5CE1FF"
    ],
    "departedAgoMin": 0,
    "arrivingInMin": 0,
    "skyAzimuthDeg": 139.8,
    "skyPathPast": [
      [
        192.5,
        43.53
      ],
      [
        190.52,
        43.81
      ],
      [
        188.55,
        44.13
      ],
      [
        186.6,
        44.47
      ],
      [
        184.64,
        44.85
      ],
      [
        182.7,
        45.27
      ],
      [
        180.77,
        45.71
      ],
      [
        178.85,
        46.18
      ],
      [
        176.93,
        46.69
      ],
      [
        175.03,
        47.23
      ],
      [
        173.14,
        47.8
      ],
      [
        171.26,
        48.41
      ],
      [
        169.39,
        49.05
      ],
      [
        167.54,
        49.73
      ],
      [
        165.69,
        50.43
      ],
      [
        163.87,
        51.17
      ],
      [
        162.06,
        51.95
      ],
      [
        160.25,
        52.76
      ],
      [
        158.46,
        53.61
      ],
      [
        156.69,
        54.49
      ],
      [
        154.93,
        55.41
      ],
      [
        153.2,
        56.36
      ],
      [
        151.46,
        57.34
      ],
      [
        149.75,
        58.38
      ],
      [
        148.06,
        59.43
      ],
      [
        146.38,
        60.53
      ],
      [
        144.72,
        61.68
      ],
      [
        143.07,
        62.84
      ],
      [
        141.45,
        64.05
      ],
      [
        139.84,
        65.3
      ]
    ],
    "skyPathAhead": [
      [
        139.84,
        65.3
      ],
      [
        136.88,
        64.1
      ],
      [
        133.93,
        62.93
      ],
      [
        131.01,
        61.81
      ],
      [
        128.11,
        60.7
      ],
      [
        125.21,
        59.65
      ],
      [
        122.34,
        58.63
      ],
      [
        119.5,
        57.63
      ],
      [
        116.68,
        56.69
      ],
      [
        113.86,
        55.77
      ],
      [
        111.08,
        54.89
      ],
      [
        108.32,
        54.04
      ],
      [
        105.58,
        53.23
      ],
      [
        102.86,
        52.45
      ],
      [
        100.16,
        51.7
      ],
      [
        97.49,
        51
      ],
      [
        94.85,
        50.32
      ],
      [
        92.22,
        49.67
      ],
      [
        89.62,
        49.06
      ],
      [
        87.05,
        48.48
      ],
      [
        84.5,
        47.93
      ],
      [
        81.99,
        47.42
      ],
      [
        79.5,
        46.93
      ],
      [
        77.03,
        46.48
      ],
      [
        74.6,
        46.05
      ],
      [
        72.19,
        45.65
      ],
      [
        69.82,
        45.28
      ],
      [
        67.47,
        44.94
      ],
      [
        65.16,
        44.62
      ],
      [
        62.88,
        44.33
      ]
    ]
  },
  {
    "id": "SAT33591",
    "kind": "satellite",
    "callsign": "NOAA 19",
    "flight": "NORAD 33591",
    "airline": "NOAA",
    "airlineIcao": "",
    "origin": "ORB",
    "originCity": "Low Earth orbit",
    "destination": "ORB",
    "destinationCity": "Low Earth orbit",
    "departUtc": "--:--",
    "arriveUtc": "--:--",
    "aircraftType": "NOAA 19",
    "aircraftTypeName": "Polar weather satellite",
    "registration": "NOAA 19",
    "altitudeFt": 2771043,
    "altitudeKm": 845,
    "speedKt": 14457,
    "trackDeg": 347,
    "lat": 27.95,
    "lon": 128.93,
    "distanceKm": 9534,
    "azimuthDeg": 43.2,
    "realElevationDeg": -40.8,
    "skyElevationDeg": 58.9,
    "bearingToOriginDeg": 167,
    "bearingToDestDeg": 347,
    "tle": [
      "1 33591U 09005A   26300.91657009  .00000025  00000+0  37133-4 0  9990",
      "2 33591  98.9392  11.7964 0013982  19.1075 341.0619 14.13491117913231"
    ],
    "colors": [
      "#E8C55A",
      "#5CE1FF"
    ],
    "departedAgoMin": 0,
    "arrivingInMin": 0,
    "skyAzimuthDeg": 51.2,
    "skyPathPast": [
      [
        59.62,
        35.08
      ],
      [
        59.04,
        35.23
      ],
      [
        58.49,
        35.43
      ],
      [
        57.95,
        35.65
      ],
      [
        57.43,
        35.94
      ],
      [
        56.94,
        36.28
      ],
      [
        56.45,
        36.66
      ],
      [
        56.01,
        37.1
      ],
      [
        55.57,
        37.58
      ],
      [
        55.15,
        38.11
      ],
      [
        54.76,
        38.7
      ],
      [
        54.38,
        39.33
      ],
      [
        54.03,
        40.01
      ],
      [
        53.7,
        40.73
      ],
      [
        53.39,
        41.52
      ],
      [
        53.1,
        42.34
      ],
      [
        52.84,
        43.22
      ],
      [
        52.59,
        44.15
      ],
      [
        52.36,
        45.11
      ],
      [
        52.16,
        46.14
      ],
      [
        51.97,
        47.21
      ],
      [
        51.82,
        48.32
      ],
      [
        51.66,
        49.49
      ],
      [
        51.54,
        50.71
      ],
      [
        51.44,
        51.96
      ],
      [
        51.36,
        53.26
      ],
      [
        51.29,
        54.61
      ],
      [
        51.23,
        55.99
      ],
      [
        51.21,
        57.42
      ],
      [
        51.19,
        58.9
      ]
    ],
    "skyPathAhead": [
      [
        51.19,
        58.9
      ],
      [
        50.02,
        57.96
      ],
      [
        48.86,
        57.08
      ],
      [
        47.73,
        56.23
      ],
      [
        46.61,
        55.42
      ],
      [
        45.49,
        54.65
      ],
      [
        44.39,
        53.92
      ],
      [
        43.3,
        53.22
      ],
      [
        42.24,
        52.56
      ],
      [
        41.17,
        51.95
      ],
      [
        40.13,
        51.37
      ],
      [
        39.09,
        50.82
      ],
      [
        38.07,
        50.33
      ],
      [
        37.07,
        49.85
      ],
      [
        36.06,
        49.42
      ],
      [
        35.07,
        49.03
      ],
      [
        34.1,
        48.66
      ],
      [
        33.14,
        48.34
      ],
      [
        32.19,
        48.06
      ],
      [
        31.26,
        47.81
      ],
      [
        30.34,
        47.6
      ],
      [
        29.43,
        47.42
      ],
      [
        28.54,
        47.29
      ],
      [
        27.65,
        47.19
      ],
      [
        26.79,
        47.12
      ],
      [
        25.93,
        47.1
      ],
      [
        25.1,
        47.11
      ],
      [
        24.28,
        47.17
      ],
      [
        23.47,
        47.25
      ],
      [
        22.68,
        47.39
      ]
    ]
  }
];
