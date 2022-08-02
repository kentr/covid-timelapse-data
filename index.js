import "./fetch-polyfill.js";
import { csv } from "d3-fetch";
import {
  extent,
  rollups,
} from "d3-array";
import { autoType } from "d3-dsv";
import {
  utcWeek,
  utcYears,
} from "d3-time";
import { createWriteStream } from "fs";
import { createGzip } from "zlib";

/**
 * Territory names used in NYT data.
 */
const territories = [
  "Northern Mariana Islands",
  "Guam",
  "Puerto Rico",
  "Virgin Islands",
  "American Samoa",
];

/**
 * Aliases for data columns.
 */
const colNames = {
  cases: "cases_avg_per_100k",
  deaths: "deaths_avg_per_100k",
};

/**
 * Start date of data.
 */
const startDate = new Date("2020-01-01");

/**
 * Processes source data.
 *
 * @param {object[]} data Source data
 * @returns { data: array, extents: { cases: number[], deaths: number[] } }
 */
function processAvgs(data) {
  const _data = data.flatMap((row) => {
        return processRow(row);
      } );

  return {
    data: rollups(
          _data,
          (g) => g[0],
          (d) => d.date,
          (d) => d.fips
        ),
    extents: {
        "cases": extent(
          _data,
          (d) => (d[colNames["cases"]] === 0
            ? undefined
            : d[colNames["cases"]])
        ),
        "deaths": extent(
          _data,
          (d) => (d[colNames["deaths"]] === 0
            ? undefined
            : d[colNames["deaths"]])
        ),
      },
  };
}

/**
 * Callback for `Array.flatMap`. Filters and processes NYT dataset.
 *
 * @returns { object[] | [] }
 *  If row passes filter criteria, returns an array containing an object
 *    that represents a typed data row.
 *  Else, returns an empty array.
 */
function processRow({
  date: dateString,
  geoid,
  county,
  state,
  cases_avg_per_100k,
  deaths_avg_per_100k,
}, byWeekMap, prefiltered = false ) {

  const date = new Date(dateString);

  // Filter by territories and week intervals.
  if (
    prefiltered ||
    (
      !territories.includes(state)
      && utcWeek.floor(date).getTime() === date.getTime()
    )
  ) {

    const typed = autoType({
      fips: geoidToFips(geoid),
      county,
      state,
      cases_avg_per_100k,
      deaths_avg_per_100k,
    });

    typed.date = date;
    typed.fips = geoidToFips(geoid);

    return [ typed ];
  }

  return [];
}

/**
 * Extracts the FIPS value from a geoid value.
 *
 * @param {string} geoid A NYT data geoid.
 * @returns {string|undefined}
 */
function geoidToFips(geoid) {
  return geoid?.toString?.().split("-")[1];
}

function main() {

  utcYears(startDate, Date.now())
    .map((date) => date.getUTCFullYear())
    .forEach(download);
}

function download(year) {
  csv(`https://raw.githubusercontent.com/nytimes/covid-19-data/master/rolling-averages/us-counties-${year}.csv`)
    .then(processAvgs)
    .then(async (dataset) => {

      const gzip = createGzip();

      gzip.pipe(createWriteStream(`nyt-rolling-averages-filtered-by-week.${year}.json.gz`));

      gzip.write(JSON.stringify(dataset));

      gzip.end();

      return dataset;
    });
}

main();
