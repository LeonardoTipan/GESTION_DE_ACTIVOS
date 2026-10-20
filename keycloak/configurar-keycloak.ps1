<#
.SYNOPSIS
  Importa el realm "gestion-activos" en Keycloak y crea un usuario de prueba por rol.

.DESCRIPTION
  Solo para DESARROLLO. Usa la API de administración de Keycloak con el usuario
  administrador del realm master. Es idempotente: si el realm ya existe, solo
  sincroniza sus clientes con el JSON; los usuarios existentes no se tocan.

  Las contraseñas NO están en este archivo: se pasan como parámetros.

.EXAMPLE
  .\keycloak\configurar-keycloak.ps1 -AdminPassword admin -TestPassword 'MiClaveDePrueba1!'
#>
param(
  [string] $KeycloakUrl = 'http://localhost:8080',
  [string] $AdminUser = 'admin',
  [Parameter(Mandatory)] [string] $AdminPassword,
  [Parameter(Mandatory)] [string] $TestPassword
)

$ErrorActionPreference = 'Stop'
$Realm = 'gestion-activos'
$RealmFile = Join-Path $PSScriptRoot 'realm-gestion-activos.json'

function Invoke-KcApi([string] $Method, [string] $Path, $Body) {
  $params = @{
    Method  = $Method
    Uri     = "$KeycloakUrl/admin/realms$Path"
    Headers = @{ Authorization = "Bearer $script:Token" }
  }
  if ($null -ne $Body) {
    $json = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Depth 10 }
    # Enviamos bytes UTF-8 para no romper tildes y eñes en Windows PowerShell 5.1.
    $params.Body = [Text.Encoding]::UTF8.GetBytes($json)
    $params.ContentType = 'application/json; charset=utf-8'
  }
  Invoke-RestMethod @params
}

# 1. Token de administrador (realm master).
$script:Token = (Invoke-RestMethod -Method Post `
    -Uri "$KeycloakUrl/realms/master/protocol/openid-connect/token" `
    -Body @{ grant_type = 'password'; client_id = 'admin-cli'; username = $AdminUser; password = $AdminPassword }
).access_token

# 2. Realm.
$realmJson = [IO.File]::ReadAllText($RealmFile, [Text.Encoding]::UTF8)
$existing = Invoke-KcApi GET '' | Where-Object { $_.realm -eq $Realm }
if ($existing) {
  # El realm ya existe: sincronizamos los clientes con el JSON (URLs de retorno,
  # orígenes, flujos...) para que el archivo versionado siga siendo la fuente de verdad.
  foreach ($client in ($realmJson | ConvertFrom-Json).clients) {
    $current = Invoke-KcApi GET "/$Realm/clients?clientId=$($client.clientId)"
    if ($current) {
      $client | Add-Member -NotePropertyName id -NotePropertyValue $current[0].id -Force
      Invoke-KcApi PUT "/$Realm/clients/$($current[0].id)" $client | Out-Null
      Write-Host "Cliente '$($client.clientId)' sincronizado con el JSON."
    } else {
      Invoke-KcApi POST "/$Realm/clients" $client | Out-Null
      Write-Host "Cliente '$($client.clientId)' creado."
    }
  }
} else {
  Invoke-KcApi POST '' $realmJson | Out-Null
  Write-Host "Realm '$Realm' importado."
}

# 3. Usuarios de prueba (uno por rol).
$testUsers = @(
  @{ username = 'admin.test';    role = 'admin';    firstName = 'Admin';    lastName = 'Prueba' },
  @{ username = 'analista.test'; role = 'analista'; firstName = 'Analista'; lastName = 'Prueba' },
  @{ username = 'auditor.test';  role = 'auditor';  firstName = 'Auditor';  lastName = 'Prueba' }
)

foreach ($u in $testUsers) {
  $found = Invoke-KcApi GET "/$Realm/users?username=$($u.username)&exact=true"
  if ($found) {
    Write-Host "Usuario '$($u.username)' ya existe: no se modifica."
    continue
  }

  Invoke-KcApi POST "/$Realm/users" @{
    username      = $u.username
    email         = "$($u.username)@gestion-activos.local"
    firstName     = $u.firstName
    lastName      = $u.lastName
    enabled       = $true
    emailVerified = $true
    credentials   = @(@{ type = 'password'; value = $TestPassword; temporary = $false })
  } | Out-Null

  $userId = (Invoke-KcApi GET "/$Realm/users?username=$($u.username)&exact=true")[0].id
  $role = Invoke-KcApi GET "/$Realm/roles/$($u.role)"
  Invoke-KcApi POST "/$Realm/users/$userId/role-mappings/realm" (ConvertTo-Json @($role) -Depth 5) | Out-Null
  Write-Host "Usuario '$($u.username)' creado con rol '$($u.role)'."
}
