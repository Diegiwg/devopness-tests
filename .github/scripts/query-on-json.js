const fs = require("fs");

function parseQuery(query) {
    const selectMatch = query.match(/filter\("(.+?)", "(.+?)", "(.+?)"\)/);
    const getMatch = query.match(/get\("(.+?)"\)/);

    return {
        select: selectMatch
            ? {
                  key: selectMatch[1],
                  value: selectMatch[2],
                  operator: selectMatch[3],
              }
            : null,
        get: getMatch ? getMatch[1] : null,
    };
}

function applyFilter(jsonData, query) {
    try {
        const { select, get } = parseQuery(query);
        let result = jsonData;

        if (select && Array.isArray(result)) {
            result =
                result.find((item) => {
                    switch (select.operator) {
                        case "==":
                            return item[select.key] == select.value;
                        case "!=":
                            return item[select.key] != select.value;
                        case ">":
                            return item[select.key] > select.value;
                        case "<":
                            return item[select.key] < select.value;
                        case ">=":
                            return item[select.key] >= select.value;
                        case "<=":
                            return item[select.key] <= select.value;
                        default:
                            return false;
                    }
                }) || {};
        }

        if (get && result) {
            result = result[get];
        }

        return result;
    } catch (error) {
        console.error("Invalid query or data structure", error);
        process.exit(1);
    }
}

function main() {
    if (process.argv.length < 4) {
        console.error("Usage: node script.js <json-file> <query>");
        process.exit(1);
    }

    const jsonFile = process.argv[2];
    const query = process.argv[3];

    try {
        const jsonData = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
        const result = applyFilter(jsonData, query);
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error("Error reading or parsing JSON file", error);
        process.exit(1);
    }
}

main();
