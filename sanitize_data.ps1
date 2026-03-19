# Gera public/workflows_data.js com apenas os campos necessarios para documentacao
# Nenhum token, credencial ou segredo e incluido

$raw_dir = "..\script_python\docs\wf_json"
$out     = "public\workflows_data.js"

$ids = "7WyJuaN2yGeMgLes","oC4n2Mfqr5xc09aE","vtaf2xKkldFQaWhS","HJfPFDN8CQai2iTy",
       "wUV5H6iKuj9NQaIj","TAajZzr5IXz64Dif","Iiqm4zstTraKehNQ","rvtoEVF0AFtfG9bn",
       "D39YbOxrLw5ldIM2","5TXqpiI54hXFdAyq","DrfFW3LnFyJxXoK9","jwbxWDh6QpkBjk2k",
       "OOBMiMBlMOUtnovi","MLLriTgQxSvWPE8Q","7MRucTinqJnBBFIb","i2cReypAGl74SZjt",
       "5oeH8Hr8hfbIRoHs","X4OhhDfeXV6xhEfp","Dm8ttrpegNchLBsU","sSVevrtS0TM3C2T0",
       "O99kMSTVQcnI7jOe","Jl49Lmk6AgzOFNX5","pbQpCkSOuDRtecpz","eJVQdYO155DJoHCV",
       "G2QYUyrS3yRusgKb","QddKcpFWS7vHaZys","xz7enrd2Jt5A6Dv2",
       "Cjr3GNU5vHU5ZaHt","pACUaII7TvDewlsV","Sf6OPopONLMwUqGc",
       "OMsIGyqY69UPOeD5","aIqfJiD2tLaFMv4Q","R97OxbUiOFrqrR4O"

function Project-Node($node) {
    $p = $node.parameters
    $safe_params = @{}

    switch ($node.type) {
        "n8n-nodes-base.webhook" {
            $safe_params["path"]       = $p.path
            $safe_params["httpMethod"] = $p.httpMethod
        }
        "n8n-nodes-base.httpRequest" {
            # Apenas URL e metodo — sem headers/body que podem ter tokens
            $url = [string]$p.url
            if ($url.Length -gt 150) { $url = $url.Substring(0,150) }
            $safe_params["url"]    = $url
            $safe_params["method"] = $p.method
        }
        "n8n-nodes-base.executeWorkflow" {
            $safe_params["workflowId"] = $p.workflowId
            $safe_params["workflow"]   = $p.workflow
        }
        "n8n-nodes-base.if" {
            $safe_params["conditions"] = $p.conditions
        }
        "n8n-nodes-base.switch" {
            $safe_params["value1"] = $p.value1
            $safe_params["value"]  = $p.value
            $safe_params["rules"]  = $p.rules
        }
        "n8n-nodes-base.set" {
            $safe_params["assignments"] = $p.assignments
            $safe_params["values"]      = $p.values
        }
        { $_ -in "n8n-nodes-base.code","n8n-nodes-base.function","n8n-nodes-base.functionItem" } {
            $code = [string]($p.jsCode + $p.functionCode)
            if ($code.Length -gt 500) { $code = $code.Substring(0,500) }
            $safe_params["jsCode"] = $code
        }
        "n8n-nodes-base.googleSheets" {
            $safe_params["operation"]   = $p.operation
            $safe_params["resource"]    = $p.resource
            $safe_params["documentId"]  = @{ cachedResultName = $p.documentId.cachedResultName }
            $safe_params["sheetName"]   = @{ cachedResultName = $p.sheetName.cachedResultName }
        }
        "n8n-nodes-base.supabase" {
            $safe_params["operation"] = $p.operation
            $safe_params["tableId"]   = $p.tableId
            $safe_params["table"]     = $p.table
        }
        "n8n-nodes-base.slack" {
            $safe_params["channel"]   = $p.channel
            $safe_params["operation"] = $p.operation
        }
        "n8n-nodes-base.scheduleTrigger" {
            $safe_params["rule"] = $p.rule
        }
    }

    # Extrai nomes de credenciais (sem IDs ou tokens)
    $cred_names = @()
    if ($node.credentials) {
        foreach ($key in $node.credentials.PSObject.Properties.Name) {
            $val = $node.credentials.$key
            if ($val -and $val.name) { $cred_names += $val.name }
        }
    }

    return @{
        name        = $node.name
        type        = $node.type
        parameters  = $safe_params
        credNames   = $cred_names
    }
}

$result = [ordered]@{}

foreach ($id in $ids) {
    $file = Join-Path $raw_dir "$id.json"
    if (-not (Test-Path $file)) { Write-Host "NAO ENCONTRADO: $id"; continue }
    try {
        $wf = Get-Content $file -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop
        $safe_nodes = @()
        foreach ($node in $wf.nodes) {
            $safe_nodes += Project-Node $node
        }
        $result[$id] = @{
            id     = $wf.id
            name   = $wf.name
            active = $wf.active
            nodes  = $safe_nodes
        }
        Write-Host "OK: $($wf.name) ($($safe_nodes.Count) nos)"
    } catch {
        Write-Host "ERRO $id`: $_"
    }
}

$json = $result | ConvertTo-Json -Depth 20 -Compress
Set-Content -Path $out -Value "const WF_DATA = $json;" -Encoding UTF8
Write-Host "Concluido: $out"
