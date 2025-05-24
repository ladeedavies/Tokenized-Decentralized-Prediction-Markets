;; Market Creation Contract
;; Handles creation and management of prediction markets

;; Error codes
(define-constant ERR-NOT-AUTHORIZED (err u200))
(define-constant ERR-MARKET-EXISTS (err u201))
(define-constant ERR-MARKET-NOT-FOUND (err u202))
(define-constant ERR-MARKET-EXPIRED (err u203))
(define-constant ERR-INVALID-PARAMETERS (err u204))

;; Market counter
(define-data-var next-market-id uint u1)

;; Market data structure
(define-map markets uint {
  creator: principal,
  title: (string-ascii 256),
  description: (string-ascii 512),
  options: (list 10 (string-ascii 128)),
  end-time: uint,
  resolution-time: uint,
  min-bet: uint,
  total-volume: uint,
  resolved: bool,
  winning-option: (optional uint),
  created-at: uint
})

;; Market bets tracking
(define-map market-bets { market-id: uint, option: uint } { total-amount: uint, bet-count: uint })

;; User bets tracking
(define-map user-bets { user: principal, market-id: uint, option: uint } uint)

;; Create a new prediction market
(define-public (create-market
  (title (string-ascii 256))
  (description (string-ascii 512))
  (options (list 10 (string-ascii 128)))
  (duration uint)
  (resolution-window uint)
  (min-bet uint)
)
  (let (
    (market-id (var-get next-market-id))
    (end-time (+ block-height duration))
    (resolution-time (+ end-time resolution-window))
  )
    ;; Validate parameters
    (asserts! (> (len options) u1) ERR-INVALID-PARAMETERS)
    (asserts! (<= (len options) u10) ERR-INVALID-PARAMETERS)
    (asserts! (> duration u0) ERR-INVALID-PARAMETERS)
    (asserts! (> min-bet u0) ERR-INVALID-PARAMETERS)

    ;; Create market
    (map-set markets market-id {
      creator: tx-sender,
      title: title,
      description: description,
      options: options,
      end-time: end-time,
      resolution-time: resolution-time,
      min-bet: min-bet,
      total-volume: u0,
      resolved: false,
      winning-option: none,
      created-at: block-height
    })

    ;; Initialize betting options
    (map-set market-bets { market-id: market-id, option: u0 } { total-amount: u0, bet-count: u0 })
    (map-set market-bets { market-id: market-id, option: u1 } { total-amount: u0, bet-count: u0 })

    ;; Increment market counter
    (var-set next-market-id (+ market-id u1))

    (ok market-id)
  )
)

;; Place a bet on a market option
(define-public (place-bet (market-id uint) (option uint) (amount uint))
  (let (
    (market (unwrap! (map-get? markets market-id) ERR-MARKET-NOT-FOUND))
    (current-bet (default-to u0 (map-get? user-bets { user: tx-sender, market-id: market-id, option: option })))
    (option-bets (default-to { total-amount: u0, bet-count: u0 }
                   (map-get? market-bets { market-id: market-id, option: option })))
  )
    ;; Validate bet
    (asserts! (>= amount (get min-bet market)) ERR-INVALID-PARAMETERS)
    (asserts! (< block-height (get end-time market)) ERR-MARKET-EXPIRED)
    (asserts! (< option (len (get options market))) ERR-INVALID-PARAMETERS)
    (asserts! (not (get resolved market)) ERR-MARKET-EXPIRED)

    ;; Transfer bet amount to contract
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))

    ;; Update user bet
    (map-set user-bets { user: tx-sender, market-id: market-id, option: option } (+ current-bet amount))

    ;; Update option totals
    (map-set market-bets { market-id: market-id, option: option } {
      total-amount: (+ (get total-amount option-bets) amount),
      bet-count: (+ (get bet-count option-bets) u1)
    })

    ;; Update market total volume
    (map-set markets market-id (merge market {
      total-volume: (+ (get total-volume market) amount)
    }))

    (ok true)
  )
)

;; Get market information
(define-read-only (get-market (market-id uint))
  (map-get? markets market-id)
)

;; Get market betting statistics
(define-read-only (get-market-bets (market-id uint) (option uint))
  (map-get? market-bets { market-id: market-id, option: option })
)

;; Get user bet amount
(define-read-only (get-user-bet (user principal) (market-id uint) (option uint))
  (default-to u0 (map-get? user-bets { user: user, market-id: market-id, option: option }))
)

;; Check if market is active for betting
(define-read-only (is-market-active (market-id uint))
  (match (map-get? markets market-id)
    market (and (< block-height (get end-time market)) (not (get resolved market)))
    false
  )
)
