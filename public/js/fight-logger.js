let subs = {}
let storeNames = {}
let storeAccounts = []
let txs = []
let fightInterval = 10 //seconds
var currCurrency = 'php'
let totalSummary = {}
var skillPrice = 0
var localPrice = 0
var bnbPrice = 0
var usdPrice = 0
var accounts = localStorage.getItem('accounts')
var names = localStorage.getItem('names')
if (accounts && names) {
    storeAccounts = JSON.parse(accounts)
    storeNames = JSON.parse(names)
}
$('document').ready(async () => {
    priceTicker()
    setInterval(() => {
        priceTicker()
    }, 30000)
    // console.log(accounts)
    for (const address of storeAccounts) { subscribe(storeNames[address], address); }
    
})

const fightAddress = $('#fight-address')
var fightResult = []
var $fightsTable = $('#fight-logs tbody')
var $earningsTable = $('#earnings-summary tbody')


async function subscribe (name, address) {
    fightAddress.append(`${address}\n`)
    console.log('Subscribed:', name, address)
    totalSummary[address] = [name, 0, 0, 0, 0]
    subs[address] = setInterval(async() => {
        try {
            const latestBlock = await getLatestBlock()
            const results = await getPastEvents('FightOutcome',   
                latestBlock.number-5,        
                latestBlock.number,
                '0x39bea96e13453ed52a734b6aceed4c41f57b2271',
                ['0x7a58aac6530017822bf3210fccef7efa31f56277f19966bc887bfb11f40ca96d',
                web3.eth.abi.encodeParameter('address', address)]
                );
            if (results.length > 0) {
                results.forEach(async result => {
                    if (!txs.includes(result.transactionHash)) {
                        const {character, enemyRoll, playerRoll, owner, skillGain, xpGain, weapon} = result.returnValues
                        const tx = await getTransaction(result.transactionHash)
                        const receipt = await getTransactionReceipt(result.transactionHash)
                        const gasCost = tx.gasPrice * receipt.gasUsed
                        // fightResult.append(`${owner},${(parseInt(playerRoll) > parseInt(enemyRoll) ? 'Win' : 'Lost')},${character},${weapon},${playerRoll},${enemyRoll},${web3.utils.fromWei(BigInt(skillGain).toString(), 'ether')},${xpGain},${web3.utils.fromWei(BigInt(gasCost).toString(), 'ether')}\n`)
                        const charData = await characterFromContract(character, await getCharacterData(character))
                        let win = (parseInt(playerRoll) > parseInt(enemyRoll) ? 'Win' : 'Lost')
                        temp = {
                            "Name" : name,
                            "Address" : owner,
                            "Level" : charData.level + 1,
                            "Result" :win,
                            "Reward" : web3.utils.fromWei(BigInt(skillGain).toString(), 'ether'),
                            "Gas" : web3.utils.fromWei(BigInt(gasCost).toString(), 'ether'),
                        }
                        if (!txs.includes(result.transactionHash)){
                            fightResult.push(temp)
                            txs.push(result.transactionHash)
                            await loadData()
                            wins = (win == "Win") ? totalSummary[owner][1] + 1: totalSummary[owner][1]
                            let fights = totalSummary[owner][2] + 1
                            let reward = totalSummary[owner][3] + parseFloat(web3.utils.fromWei(BigInt(skillGain).toString(), 'ether'))
                            let gas = totalSummary[owner][4] + gasCost
                            totalSummary[owner] = [name, wins, fights, reward, gas]
                            await addToSummary()                            
                        }
                    }
                })                
            }
        }catch(e) {
            console.log(e)
        }
    }, 1000)
}

function toLocaleCurrency(val) {
    return val.toLocaleString('en-US', { style: 'currency', currency: currCurrency.toUpperCase() })
}
function convertToFiat (val) {
    return parseFloat(val) * localPrice
}
function convertBnbToFiat (val) {
    return parseFloat(val) * bnbPrice
}
async function priceTicker() {
    $.get(`https://api.coingecko.com/api/v3/simple/price?ids=cryptoblades,binancecoin,tether&vs_currencies=usd,php`, (result) => {
        skillPrice = result.cryptoblades['usd']
        localPrice = result.cryptoblades[currCurrency]
        bnbPrice = result.binancecoin[currCurrency]
        usdPrice = result.tether[currCurrency]
    })
}

async function addAccount() {
    var name = $('#logger-name').val().trim()
    var address = $('#logger-address').val().trim()
    if (!Object.keys(subs).includes(address) && isAddress(address) && !Object.keys(storeNames).includes(name)) {
        await subscribe(name, address)
        storeAccounts.push(address)
        storeNames[address] = name
        if (storeAccounts) localStorage.setItem('accounts', JSON.stringify(storeAccounts))
        if (storeNames) localStorage.setItem('names', JSON.stringify(storeNames))
        $('#modal-add-account').modal('hide')
        $('#logger-name').val('')
        // test()
        // await loadData()
    }
}

function test(){
    temp = {
        "Name" : "",
        "Address" : "test",
        "Level" : 25,
        "Result" : 'Win',
        "Reward" : '2',
        "Gas" : '1',
    }
    fightResult.push(temp)
}
async function loadData() {
    $totalElement = $fightsTable.children().last()
    totalSkill = 0
    totalProfit = 0
    totalGas = 0
    fights = 0
    wins = 0
    $fightsTable.html('');
    console.log(fightResult)
    const fRowHtml = await Promise.all(fightResult.map(async (fight, i) => {
        let rowHtml = ''
        skill = convertToFiat(parseFloat(fight['Reward']))
        gas = convertBnbToFiat(parseFloat(fight['Gas']))
        profit = skill - gas
        totalSkill += parseFloat(fight['Reward'])
        totalGas += parseFloat(fight['Gas'])
        totalProfit += profit
        fights += 1
        wins += fight['Result'] === "Win" ? 1 : 0
        rowHtml += ` <tr class="text-white align-middle" data-row="${i}">
                                <td class='align-middle'>${fight['Name']}</td>
                                <td class='align-middle'>${fight['Address'].substr(0, 6)}...${fight['Address'].substr(-4, 4)}</td>
                                <td class='align-middle'>Lv. ${fight['Level']}</td>
                                <td class='align-middle'>${fight['Result']}</td>
                                <td class='align-middle'>${parseFloat(fight['Reward']).toFixed(6)} SKILL<br />${(Number(parseFloat(fight['Reward'])) > 0 ? `<span style="font-size: 10px;">(${toLocaleCurrency(skill)})</span>` : '')}</td>
                                <td class='align-middle'>${parseFloat(fight['Gas']).toFixed(6)} BNB<br />${(Number(parseFloat(fight['Gas'])) > 0 ? `<span style="font-size: 10px;">(${toLocaleCurrency(gas)})</span>` : '')}</td>
                                <td class='align-middle'>${toLocaleCurrency(profit)}</td>
                            </tr>`;
        return rowHtml
    }))
    totalTotal = `<tr class="text-white align-middle">
                    <td colspan="3" style="text-align: right">Total</td>
                    <td class='align-middle'>${wins}/${fights}</td>
                    <td class='align-middle'>${parseFloat(totalSkill).toFixed(6)} SKILL<br />${(Number(parseFloat(totalSkill)) > 0 ? `<span style="font-size: 10px;">(${toLocaleCurrency(convertToFiat(totalSkill))})</span>` : '')}</td>
                    <td class='align-middle'>${parseFloat(totalGas).toFixed(6)} BNB<br />${(Number(parseFloat(totalGas)) > 0 ? `<span style="font-size: 10px;">(${toLocaleCurrency(convertBnbToFiat(totalGas))})</span>` : '')}</td>
                    <td class='align-middle'>${toLocaleCurrency(totalProfit)}</td>
                  </tr>`
    $fightsTable.html(fRowHtml + totalTotal)
}

async function addToSummary(){
    $earningsTable.html('')
    const fRowHtml = await Promise.all(Object.keys(totalSummary).map(async (key, i) => {
        let rowHtml = ''
        let totalSkill = totalSummary[key][3]
        let totalGas = web3.utils.fromWei(BigInt(totalSummary[key][4]).toString(), 'ether')
        let totalSkillConverted = convertToFiat(totalSkill)
        let totalGasConverted = convertBnbToFiat(totalGas)
        let totalProfit = totalSkillConverted - totalGasConverted
        rowHtml += ` <tr class="text-white align-middle" data-row="${i}">
                                <td class='align-middle'>${totalSummary[key][0]}</td>
                                <td class='align-middle'>${key.substr(0, 6)}...${key.substr(-4, 4)}</td>
                                <td class='align-middle'>${totalSummary[key][1]} / ${totalSummary[key][2]}</td>
                                <td class='align-middle'>${totalSkill.toFixed(6)} SKILL<br />${(Number(totalSkill) > 0 ? `<span style="font-size: 10px;">(${toLocaleCurrency(totalSkillConverted)})</span>` : '')}</td>
                                <td class='align-middle'>${parseFloat(totalGas).toFixed(6)} BNB<br />${(Number(parseFloat(totalGas)) > 0 ? `<span style="font-size: 10px;">(${toLocaleCurrency(totalGasConverted)})</span>` : '')}</td>
                                <td class='align-middle'>${toLocaleCurrency(totalProfit)}</td>
                            </tr>`;
        return rowHtml
    }))
    $earningsTable.html(fRowHtml)
}


function exportList() {
    var list = fightAddress.val().split('\n')
    list.splice(list.length-1, 1)
    if (list.length > 0) {
        var textToSave = list.join('\n')
        var textToSaveAsBlob = new Blob([textToSave], {
            type: "text/plain"
        });
        var textToSaveAsURL = window.URL.createObjectURL(textToSaveAsBlob);
        var downloadLink = document.createElement("a");
        downloadLink.download = `CBTracker-Address-List-${new Date().getTime()}.txt`;
        downloadLink.innerHTML = "Download File";
        downloadLink.href = textToSaveAsURL;
        downloadLink.onclick = function () {
            document.body.removeChild(event.target);
        };
        downloadLink.style.display = "none";
        document.body.appendChild(downloadLink);
        downloadLink.click();
    }
}

function exportLogs() {
    var list = fightResult.val().split('\n')
    list.splice(list.length-1, 1)
    if (list.length > 0) {
        var textToSave = list.join('\n')
        var textToSaveAsBlob = new Blob([textToSave], {
            type: "text/plain"
        });
        var textToSaveAsURL = window.URL.createObjectURL(textToSaveAsBlob);
        var downloadLink = document.createElement("a");
        downloadLink.download = `CBTracker-Fight-Logs-${new Date().getTime()}.txt`;
        downloadLink.innerHTML = "Download File";
        downloadLink.href = textToSaveAsURL;
        downloadLink.onclick = function () {
            document.body.removeChild(event.target);
        };
        downloadLink.style.display = "none";
        document.body.appendChild(downloadLink);
        downloadLink.click();
    }
}

function importList() {
    if (!window.File || !window.FileReader || !window.FileList || !window.Blob) {
        return alert('The File APIs are not fully supported in this browser.');
    }

    var input = document.getElementById('file-import');
    if (!input) {
        return alert("Um, couldn't find the fileinput element.");
    }
    if (!input.files) {
        return alert("This browser doesn't seem to support the `files` property of file inputs.");
    }
    if (!input.files[0]) {
        return alert("Please select a file before clicking 'Import'");
    }
    var fileType = input.files[0].type
    if (fileType === 'text/plain') {
        var file = input.files[0];
        var fr = new FileReader();
        fr.readAsText(file);
        fr.addEventListener('load', function () {
            var rows = fr.result.split("\r\n")
            console.log(rows)
            if (rows.length) {
                rows.forEach(async address => {
                    if (!Object.keys(subs).includes(address) && isAddress(address)) {
                        await subscribe(address)        
                        fightAddress.append(`${address}\n`)
                    }
                })
            }
            $('#modal-import').modal('hide')
        });
    } else alert("Please import a valid json/text file");
}

function copy_address_to_clipboard() {
    navigator.clipboard.writeText('0x2548696795a3bCd6A8fAe7602fc26DD95A612574').then(n => alert("Copied Address"),e => alert("Fail\n" + e));
}


window.addEventListener('beforeunload', function (e) {
    if (fightResult.val()) {
        e.preventDefault();
        e.returnValue = 'Your fight logs will be lost. Please save them before closing/refreshing this page';
    }
});

$('#modal-add-account').on('shown.bs.modal', function (e) {
    $('#logger-address').val('')
});

window.addEventListener('beforeunload', function (e) {
    if (fightResult.val()) {
        e.preventDefault();
        e.returnValue = 'Your fight logs will be lost. Please save them before closing/refreshing this page';
    }
});