$base = "http://localhost:5000"
$headers = @{
  "x-client-id" = "partner_test"
  "x-api-key"   = "partner_secret_123"
}

Write-Host "1. Negative auth test (should fail 401)..."
try {
    Invoke-RestMethod -Method GET -Uri "$base/api/integrations/orders"
    Write-Host "FAILED: Auth test passed unexpectedly." -ForegroundColor Red
} catch {
    Write-Host "PASSED: Auth test failed as expected (Status: $($_.Exception.Response.StatusCode.value__))." -ForegroundColor Green
}

Write-Host "`n2. Fetch orders list..."
$orders = Invoke-RestMethod -Method GET -Uri "$base/api/integrations/orders?page=1&limit=20" -Headers $headers
if ($orders.success -eq $true -and $orders.data.Count -gt 0) {
    Write-Host "PASSED: Fetched $($orders.data.Count) orders." -ForegroundColor Green
    $orderId = $orders.data[0].orderId
    Write-Host "Captured orderId: $orderId"
} else {
    Write-Host "FAILED: Could not fetch orders." -ForegroundColor Red
    exit 1
}

Write-Host "`n3. Fetch single order header..."
$singleOrder = Invoke-RestMethod -Method GET -Uri "$base/api/integrations/orders/$orderId" -Headers $headers
if ($singleOrder.success -eq $true) {
    Write-Host "PASSED: Fetched order header for $orderId." -ForegroundColor Green
} else {
    Write-Host "FAILED: Could not fetch order header." -ForegroundColor Red
}

Write-Host "`n4. Fetch item-level details..."
$details = Invoke-RestMethod -Method GET -Uri "$base/api/integrations/order-details/$orderId" -Headers $headers
if ($details.success -eq $true) {
    Write-Host "PASSED: Fetched order details." -ForegroundColor Green
} else {
    Write-Host "FAILED: Could not fetch order details." -ForegroundColor Red
}

Write-Host "`n5. Send delivery callback (DELIVERED)..."
$deliveryBody = @{
  status = "DELIVERED"
  timestamp = (Get-Date).ToUniversalTime().ToString("o")
  note = "Delivered successfully"
  partnerReferenceId = "TP-ORD-123456"
} | ConvertTo-Json

$deliveryRes = Invoke-RestMethod -Method POST -Uri "$base/api/integrations/orders/$orderId/delivery-status" -Headers $headers -ContentType "application/json" -Body $deliveryBody
if ($deliveryRes.success -eq $true) {
    Write-Host "PASSED: Delivery status updated." -ForegroundColor Green
} else {
    Write-Host "FAILED: Could not update delivery status." -ForegroundColor Red
}

Write-Host "`n6. Send same callback again (idempotency test)..."
$deliveryRes2 = Invoke-RestMethod -Method POST -Uri "$base/api/integrations/orders/$orderId/delivery-status" -Headers $headers -ContentType "application/json" -Body $deliveryBody
if ($deliveryRes2.success -eq $true) {
    Write-Host "PASSED: Idempotency check successful (Message: $($deliveryRes2.message))." -ForegroundColor Green
} else {
    Write-Host "FAILED: Idempotency check failed." -ForegroundColor Red
}

Write-Host "`n7. Inventory endpoint test (should fail 409 by design)..."
$invBody = @{
  orderId = $orderId
  items = @(
    @{ itemCode = $details.data[0].itemCode; qty = $details.data[0].qty }
  )
} | ConvertTo-Json -Depth 6

try {
    Invoke-RestMethod -Method POST -Uri "$base/api/integrations/inventory/update" -Headers $headers -ContentType "application/json" -Body $invBody
    Write-Host "FAILED: Inventory update allowed unexpectedly (should be 409 for AT_ORDER_PLACEMENT)." -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 409) {
        Write-Host "PASSED: Inventory update blocked as expected (Status: 409)." -ForegroundColor Green
    } else {
        Write-Host "FAILED: Inventory update failed with unexpected status: $($_.Exception.Response.StatusCode.value__)." -ForegroundColor Red
    }
}
