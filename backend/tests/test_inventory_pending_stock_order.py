from routers.inventory import _latest_pending_stock_receipt_activity, sort_pending_stock_items


def test_partial_receipt_updates_pending_stock_activity_time():
    activities = _latest_pending_stock_receipt_activity([
        {
            "movement_id": 12,
            "created_at": "2026-07-24T03:41:47.000000+00:00",
            "remarks": "[PO_PENDING_STOCK] PO_ITEM:89 Pending stock from supplier",
        },
        {
            "movement_id": 13,
            "created_at": "2026-07-24T04:00:00.000000+00:00",
            "remarks": "[PO_PENDING_STOCK] PO_ITEM:89 Pending stock from supplier [TRANSFER_RECEIVED]",
        },
    ])

    assert activities == {89: "2026-07-24T04:00:00.000000+00:00"}


def test_pending_stock_uses_latest_delivery_activity_then_stable_id_tie_breaker():
    items = [
        {
            "pending_transfer_id": 18,
            "created_at": "2026-07-24T03:41:47.000000+00:00",
            "activity_at": "2026-07-24T03:41:47.000000+00:00",
        },
        {
            "pending_transfer_id": 12,
            "created_at": "2026-07-23T10:54:16.000000+00:00",
            "activity_at": "2026-07-25T08:00:00.000000+00:00",
        },
        {
            "pending_transfer_id": 19,
            "created_at": "2026-07-24T03:41:47.000000+00:00",
            "activity_at": "2026-07-24T03:41:47.000000+00:00",
        },
        {"pending_transfer_id": 4, "created_at": None, "activity_at": None},
    ]

    ordered = sort_pending_stock_items(items)

    assert [item["pending_transfer_id"] for item in ordered] == [12, 19, 18, 4]
