const { randomBytes } = require('crypto');
const { response } = require('express');
const { stat } = require('fs');
const secp256k1 = require('secp256k1');
const SxAddress = require('../stealth/StealthAddress');
const axios = require('axios').default;
var qs = require('qs');
var request = require("request");

const dotenv = require("dotenv");
dotenv.config();

const util = require('util');
const requestPromise = util.promisify(request);

const WATCHONLY_API_URL = "http://164.92.101.99:4444/api/";
const GET_BLOCCK_COUNT = "getblockcount";
const GET_ADDRESS_STATUS = "status";
const GET_IMPORT_ADDRESS = "importlightaddress";
const GET_TRANSACTIONS = "getwatchonlytxs";
const GET_CHECK_KEYIMAGES = "checkkeyimages";
const GET_ANON_OUTPUTS = "getanonoutputs";
const POST_SEND_RAW_TRANSACTION = "sendrawtransaction";
const GET_TX_OUT = "gettxout";

const USER = process.env.RPC_USER;
const PASS = process.env.RPC_PASSWORD;
const RPC_PORT = process.env.LIGHT_WALLET_RPC_PORT;

// const SEND_TO_ADDRESS = "3tXzvUU6PnWvZZaDt56uX8B9DT62QRVvAheWwRCyiG4TJyco8CdxbzkHUD24Ns7jdMP4GicdUMo5AmGCdTwfhq3QPHqUJvoZGF9sYWm";
const SEND_TO_ADDRESS = "msvVCUqbUR7YJX5VjaRmFXnyMobbGxApUt";
// const SEND_TO_ADDRESS = "tv1qrj2t6an7a56ydafj899x9cl7f76gg3lanrlcsh"
const SEND_AMOUNT = 10;
const FEE = 0.1;

const SEND_SEALTH = false;
const SEND_TX = false;

const headers = {
    "content-type": "text/plain;"
  };

// Private Scan b159d2e0177706b1abbe770f94a962dc8c663243aaacceaf96eb209aa332949c
// Private Spend ac16a86d6c23ee28c7d7abe15556f273ce0cbda097540978a9cfda2470b670c6
// Public Spend 023e3442f0c3196d1e2819697955e60b39d8d60921200df785f9505613e9fa507b
// {
//   "scanPub": "2,174,96,113,132,115,194,223,34,253,16,213,47,88,160,105,17,16,198,231,81,109,178,158,74,169,63,110,203,252,32,192,62",
//   "spendPub": "2,62,52,66,240,195,25,109,30,40,25,105,121,85,230,11,57,216,214,9,33,32,13,247,133,249,80,86,19,233,250,80,123",
//   "scanPriv": "hidden",
//   "spendPriv": "hidden",
//   "options": 0,
//   "address": "3tXzvUU6PnWvZZaDt56uX8B9DT62QRVvAheWwRCyiG4TJyco8CdxbzkHUD24Ns7jdMP4GicdUMo5AmGCdTwfhq3QPHqUJvoZGF9sYWm",
//   "isStealth": {
//     "valid": false
//   }
// }

// generates a private key from a secure/random source

generatePrivateKey = () => {
    // generate privKey
    let privKey;
    do {
      privKey = randomBytes(32);
      // check if the seed is within the secp256k1 range
    } while (!secp256k1.privateKeyVerify(privKey));
  
    return privKey;
  };
  
  // generate a public key based on the current seeds
  generatePublicKey = privKey => {
    // get the public key in a compressed format
    return secp256k1.publicKeyCreate(privKey);
  };



  hex2Buf = hexString => {
    return new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  };

  buf2hex = buffer => {
    return buffer.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
  };
  

// Read keys 
const readScanPriv = hex2Buf("b159d2e0177706b1abbe770f94a962dc8c663243aaacceaf96eb209aa332949c", "hex");
if(!secp256k1.privateKeyVerify(readScanPriv)) {
    console.log("Failed to read scan private key");
}

const readPublicSpend = hex2Buf("023e3442f0c3196d1e2819697955e60b39d8d60921200df785f9505613e9fa507b");
if(readPublicSpend.length != 33) {
    console.log("Failed to read public scan key");
}

const readSpendPriv = hex2Buf("ac16a86d6c23ee28c7d7abe15556f273ce0cbda097540978a9cfda2470b670c6");
if(!secp256k1.privateKeyVerify(readSpendPriv)) {
    console.log("Failed to read spend private key");
}

let addressVerified = false;
let anonutxos = [];
let stealthutxos = [];
let utxosKeyImages = [];
let utxosStealthInfo = [];
let stealthChecked = {};
let anonbalance = 0;
let stealthbalance = 0;
let stealthSpentCount = 0;
let anonSpentCount = 0;
let anonoutputs = [];

// Create Stealth Address
const address = new SxAddress(
    readScanPriv,
    generatePublicKey(readScanPriv),
    readSpendPriv,
    generatePublicKey(readSpendPriv)
  );

// Check if address is synced to watchonly server
async function getAddressStatus() {
    try {
        const params = { scansecret: buf2hex(readScanPriv), spendpublic: buf2hex(readPublicSpend)};
        let response = await axios.get(WATCHONLY_API_URL+GET_ADDRESS_STATUS, {params});
        console.log("Address Status: " + response.data.result.status);
        if (response.data.result.status === "synced") {
            addressVerified = true;
        }
        return response.data.result.status;
    } catch(error) {
        console.log(error);
        return error;
    }
}

async function importAddress() {
    try {
        const params = { scansecret: buf2hex(readScanPriv), spendpublic: buf2hex(readPublicSpend), createdheight: 0};
        let response = await axios.get(WATCHONLY_API_URL+GET_IMPORT_ADDRESS, {params});
        if (response.data.result === "Success") {
            console.log("Imported address " + response.data.stealth_address_normal + ".\n Scanning from block " + response.data.created_on + ".\n Imported on " + response.data.imported_on);
            return true;
        } else {
            console.log(response.data);
            return false;
        }
    } catch(error) {
        console.log(error);
        return false;
    }
}

async function getTransactions() {
    try {
        if (!addressVerified) {
            console.log("Address not verified by server");
            return false;
        }
        const params = { scansecret: buf2hex(readScanPriv), startingindex: 0};
        let response = await axios.get(WATCHONLY_API_URL+GET_TRANSACTIONS, {params});

        anonutxos = response.data.result.anon;
        stealthutxos = response.data.result.stealth;
        return true;
    } catch(error) {
        console.log(error);
        return false;
    }
}

async function checkStealthSpent() {
    try {
        await stealthutxos.forEach(utxo => {
            getTxOut(utxo.tx_hash, utxo.n);
        });

        return true;
    } catch(error) {
        console.log(error);
        return false;
    }
}

async function getTxOut(hash, index) {
    try {
        const params = { txid: hash, n: index };
        let response = await axios.get(WATCHONLY_API_URL+GET_TX_OUT, {params});


        let spent = response.data.result === null;
        stealthChecked[`${hash}${index}`] = spent;
        return true;

    } catch(error) {
        console.log(error);
        return false;
    }
}

/// Get the keyimages from the light wallet
/// This would be done by Zelcore running the daemon with -lightwallet=1
/// calling getkeyimages and passing in the correct params
async function getKeyImages(type) {
    try {
        var keyimages = [];
        if (type === "anon") {
            for (const item in Object.keys(anonutxos)) {
                    keyimages.push(`"${anonutxos[item].raw}"`);
            }
        } else if (type === "stealth") {
            for (const item in Object.keys(stealthutxos)) {
                keyimages.push(`"${stealthutxos[item].raw}"`);
            }
        }

        var params = [];
        params.push(`[${keyimages}]`);
        params.push(`"${buf2hex(readSpendPriv)}"`);
        params.push(`"${buf2hex(readScanPriv)}"`);
        params.push(`"${buf2hex(readPublicSpend)}"`);
        var dataString = `{"jsonrpc":"1.0","id":"curltext","method":"getkeyimages","params":[${params.join(',')}]}`;

        var options = {
            url: `http://${USER}:${PASS}@127.0.0.1:${RPC_PORT}/`,
            method: "POST",
            headers: headers,
            body: dataString
        };

        const result = await requestPromise(options)
        // console.log(result);
        return result;
    } catch (error) {
        console.log(error);
        return false;
    }
}

async function checkKeyImages() {
    try {
        if (!utxosKeyImages.length) {
            console.log("No Key images to find");
            return false;
        }

        var keys = [];

        for (item in utxosKeyImages) {
            if (utxosKeyImages[item].tx_type === "anon") {
                keys.push(utxosKeyImages[item].keyimage);
            } 
        }

        var quoted = "\"" + keys.join("\",\"") + "\"";

        const params = {};
        let response = await axios.get(`${WATCHONLY_API_URL}${GET_CHECK_KEYIMAGES}/[${quoted}]`, {params});

        // update our keyimage list
        for (item in response.data.result) {
            if (response.data.result[item].status === 'valid') {
                utxosKeyImages[item].spent = response.data.result[item].spent;
                utxosKeyImages[item].spentinmempool = response.data.result[item].spentinmempool;
                utxosKeyImages[item].txid = response.data.result[item].txid;
            } else {
                utxosKeyImages[item].spent = null;
                utxosKeyImages[item].spentinmempool = null;
            }
        }
       
        return true;
    } catch(error) {
        console.log(error);
        return false;
    }
}

async function getAnonOutputs() {
    try {
        const params = { inputssize: 5, ringsize: 5 };
        let response = await axios.get(WATCHONLY_API_URL+GET_ANON_OUTPUTS, {params});
        anonoutputs = response.data.result;
        return true;

    } catch (error) {
        console.log(error);
        return false;
    }
}

async function createSignedTransaction() {
    try {
        let currentAmount = 0;
        var rawUtxoData = [];
        var rawAnonOutputData = [];
        if (SEND_SEALTH) {
            for (const item in Object.keys(utxosStealthInfo)) {
                if(stealthChecked[`${utxosStealthInfo[item].tx_hash}${utxosStealthInfo[item].tx_index}`] === false) {
                    if (currentAmount <= SEND_AMOUNT) {
                        currentAmount += utxosStealthInfo[item].amount;
                        rawUtxoData.push(`"${stealthutxos[item].raw}"`);
                    }
                }
            }

        } else {
            for (const item in Object.keys(anonutxos)) {
                if (utxosKeyImages[item].spent || utxosKeyImages[item].spentinmempool) {
                    continue;
                }

                if (currentAmount <= SEND_AMOUNT) {
                    currentAmount += utxosKeyImages[item].amount;
                    rawUtxoData.push(`"${anonutxos[item].raw}"`);
                } else {
                    break;
                }
            }
        }

        for (const item in Object.keys(anonoutputs)) {
            rawAnonOutputData.push(`"${anonoutputs[item].raw}"`);
        }

        var params = [];
        params.push(`"${SEND_TO_ADDRESS}"`);
        params.push(`"${SEND_AMOUNT}"`);
        params.push(`"${buf2hex(readSpendPriv)}"`);
        params.push(`"${buf2hex(readScanPriv)}"`);
        params.push(`"${buf2hex(readPublicSpend)}"`);
        params.push(`[${rawUtxoData}]`);
        params.push(`[${rawAnonOutputData}]`);
        var dataString = `{"jsonrpc":"1.0","id":"curltext","method":"buildlightwallettx","params":[${params.join(',')}]}`;

        var options = {
            url: `http://${USER}:${PASS}@127.0.0.1:${RPC_PORT}/`,
            method: "POST",
            headers: headers,
            body: dataString
        };

        const result = await requestPromise(options)
        return result;
    } catch (error) {
        console.log(error);
        return false;
    }
}

async function sendRawHex() {
    try {
        var data = qs.stringify({
            'rawhex': rawSignedHex 
          });
          var config = {
            method: 'post',
            url: WATCHONLY_API_URL+POST_SEND_RAW_TRANSACTION,
            headers: { 
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            data : data
          };

        let response = await axios(config);
        return response;

    } catch (error) {
        console.log(error);
        return false;
    }
}

function checkSpendableAmount() {
    var amount = 0;
    for (const item in utxosKeyImages) {
        if (utxosKeyImages[item].spent === false) {
            amount += utxosKeyImages[item].amount;
        } else {
            anonSpentCount++;
        }
    }
    anonbalance = amount;

    amount = 0;

    for (const item in utxosStealthInfo) {
        if(stealthChecked[`${utxosStealthInfo[item].tx_hash}${utxosStealthInfo[item].tx_index}`] === false) {
            amount += utxosStealthInfo[item].amount;
        } else {
            stealthSpentCount++;
        }
    }
    stealthbalance = amount;

}

function displayData() {
    console.log("Total number unspent Anon utxos: ", anonutxos.length - anonSpentCount);
    console.log("Total Anon balance: ", anonbalance);

    console.log("Total number unspent Stealth utxos: ", stealthutxos.length - stealthSpentCount);
    console.log("Total Stealth balance: ", stealthbalance);

    // console.log("Total KeyImages: ", utxosKeyImages.length);
}

// API - Check address status - If address not imported, import it. 
// API - Fetch transactions for address
// Light Daemon - Get keyimages
// API - Check keyimage is spent
// API - Fetch anonoutputs
// Light Daemon - Build Tx

async function spendFromAddress() {
    try {
        let addressValue = await getAddressStatus();

        if (addressValue == "failed") {
            console.log("importing address");
            await importAddress();
        } else if (addressValue == "scanning") {
            console.log("Address Scanning... Please wait and try again");
        } else {
            await getTransactions();
            await checkStealthSpent();

            let anonInfo = await getKeyImages('anon');
            const anonData = JSON.parse(anonInfo.body);
            anonData.result.forEach(element => {
                utxosKeyImages.push(element);
            });

            let stealthInfo = await getKeyImages('stealth');
            const stealthData = JSON.parse(stealthInfo.body);
            stealthData.result.forEach(element => {
                utxosStealthInfo.push(element);
            });

            await checkKeyImages();

            checkSpendableAmount();
            displayData();

            await getAnonOutputs();

            let txInfo = await createSignedTransaction();
            const txData = JSON.parse(txInfo.body);
            rawSignedHex = txData.result;

            if (rawSignedHex === null) {
                console.log("Transaction creation process failed");
            } else {
                if (SEND_TX) {
                    sendRawHex().then(function(sendValue) {
                        console.log("Tx Sent - ", sendValue.data);
                    });
                } else {
                    console.log(rawSignedHex);
                }
            }
        }

    } catch (error) {
        console.log(error);
    }
}

spendFromAddress();
