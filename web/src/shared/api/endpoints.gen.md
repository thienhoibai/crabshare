# Bảng endpoint (tự sinh từ OpenAPI, không sửa tay)

Kiểu dữ liệu ở `api.gen.ts`. `[form]` là multipart/form-data.

## Accounts

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/me/kyc` |  |  | KycStatusResponse | Trạng thái xác minh và lần eKYC gần nhất của nhà đầu tư đang đăng nhập |
| POST | `/api/kyc/ekyc` |  | { IdCardFront?: IFormFile IdCardBack?: IFormFile Selfie?: IFormFile Consent?: boolean } [form] | KycStatusResponse | UC02 — Xác minh danh tính bằng CCCD và ảnh khuôn mặt |

## AdminAccounts

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/admin/kyc-checks` | Result, CheckType, Page, PageSize |  | PagedResultOfAdminKycResponse |  |
| GET | `/api/admin/users/{id}` |  |  | AdminUserDetailResponse |  |
| GET | `/api/admin/users` | Role, Status, Q, Page, PageSize |  | PagedResultOfAdminUserResponse |  |
| POST | `/api/admin/kyc-checks/{id}/approve-exception` |  | AdminAccountDecisionRequest | AdminKycResponse |  |
| POST | `/api/admin/users/{id}/lock` |  | AdminAccountDecisionRequest | AdminUserResponse |  |
| POST | `/api/admin/users/{id}/unlock` |  | AdminAccountDecisionRequest | AdminUserResponse |  |

## AdminAlerts

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/admin/alerts` | Status, Severity, Q, Page, PageSize |  | PagedResultOfAlertResponse |  |
| POST | `/api/admin/alerts/{id}/resolve` |  | ResolveAlertRequest | AlertResponse |  |

## AdminBatches

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/admin/batches/{code}` |  |  | AdminBatchResponse |  |
| GET | `/api/admin/batches` | Status, BatchMode, Page, PageSize |  | PagedResultOfAdminBatchResponse |  |
| POST | `/api/admin/batches/{code}/approve` |  | ApproveBatchRequest | AdminBatchResponse |  |
| POST | `/api/admin/batches/{code}/reject` |  | RejectBatchRequest | AdminBatchResponse |  |
| POST | `/api/admin/batches/{code}/request-revision` |  | RejectBatchRequest | AdminBatchResponse |  |
| POST | `/api/admin/batches` |  | AdminBatchRequest | BatchResponse | Admin tạo lô T hoặc lô A (BR-018…020) |

## AdminDashboard

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/admin/dashboard` | From, To, BatchCode |  | AdminDashboardResponse |  |
| GET | `/api/admin/reports/{name}.csv` | From, To, BatchCode |  |  |  |

## AdminOperators

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/admin/operators` | Status, Page, PageSize |  | PagedResultOfAdminOperatorResponse |  |
| POST | `/api/admin/operators/{id}/approve` |  | ApproveOperatorRequest | AdminOperatorResponse |  |
| POST | `/api/admin/operators/{id}/reject` |  | OperatorDecisionRequest | AdminOperatorResponse |  |
| POST | `/api/admin/operators/{id}/suspend` |  | OperatorDecisionRequest | AdminOperatorResponse |  |

## AdminParties

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/admin/parties/{partyId}/documents/{documentId}/file` |  |  |  |  |
| GET | `/api/admin/parties/{partyId}/dossier` |  |  | PartyDossierResponse | Căn cứ để xác minh: tài khoản đứng tên, kết quả eKYC và giấy tờ pháp lý đã gửi (BR-009) |
| GET | `/api/admin/parties/{partyId}` |  |  | PartyResponse |  |
| GET | `/api/admin/parties` | Search, RoleType, VerificationStatus, Page, PageSize |  | PagedResultOfPartySummaryResponse |  |
| POST | `/api/admin/parties/{partyId}/reject` |  | PartyDecisionRequest | PartyResponse |  |
| POST | `/api/admin/parties/{partyId}/roles` |  | RoleChangeRequest | PartyResponse | Thêm vai trò hoặc đổi trạng thái vai trò của đối tác (tạm dừng, thu hồi) |
| POST | `/api/admin/parties/{partyId}/verify` |  |  | PartyResponse |  |
| POST | `/api/admin/parties` |  | ExternalPartyRequest | PartyResponse | Admin ghi nhận nhà cung cấp hoặc bên cam kết thu mua (đã xác minh) |

## AdminPayments

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/admin/payment-instructions` | Type, Status, BatchCode |  | PaymentInstructionResponse[] | UC40 — Lệnh chi (giải ngân, chi trả, hoàn tiền), lọc theo type, status, batchCode; mới nhất trước, tối đa 200 dòng |
| GET | `/api/admin/payments/unmatched` |  |  | UnmatchedTransactionResponse[] | UC40 — Giao dịch tiền vào chưa khớp khoản thu hoặc đến trễ, chờ đối soát tay |
| POST | `/api/admin/payment-instructions/{id}/send` |  |  | PaymentInstructionResponse | UC40 — Gửi lệnh chi qua cổng thanh toán (sandbox xác nhận ngay → Succeeded; bị từ chối → Failed, gửi lại được) |

## AdminQc

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| DELETE | `/api/admin/qc-inspectors/{userId}` |  |  |  |  |
| GET | `/api/admin/qc-inspectors` |  |  | QcInspectorResponse[] | Pool Nhân viên kiểm phẩm kèm thống kê uy tín (BR-017) |
| POST | `/api/admin/qc-inspectors` |  | GrantQcRequest |  |  |

## AdminSettlements

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/admin/settlements/{id}` |  |  | SettlementResponse | Bảng quyết toán đầy đủ cho admin: doanh thu, chi phí khoá, Pool, thù lao, từng dòng nhà đầu tư, góp ý |
| GET | `/api/admin/settlements` |  |  | AdminSettlementSummary[] | Lô đang thu hoạch / chờ quyết toán / đã đóng, kèm bảng quyết toán nếu đã tính |
| POST | `/api/admin/batches/{code}/settlements` |  | CalculateSettlementRequest | SettlementResponse | UC38 — Tính bảng quyết toán nháp (201); tính lại trước khi duyệt thì tăng revision_no (200); đã duyệt → 409 settlement.locked |
| POST | `/api/admin/settlements/{id}/approve` |  |  | SettlementResponse | UC39 — Duyệt (hết hạn góp ý, không còn góp ý mở) → khoá số liệu, lập lệnh chi: thuế khai thay, người nuôi, từng nhà đầu tư |
| POST | `/api/admin/settlements/{id}/send-payouts` |  |  | SettlementResponse | UC39 — Gửi mọi lệnh chi quyết toán còn chờ; nhà đầu tư nhận đủ → bảng PaidOut, lô Closed |

## Alerts

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/batches/{code}/alerts` | Status |  | AlertResponse[] |  |
| GET | `/api/operators/me/alerts` | Status |  | AlertResponse[] |  |
| POST | `/api/alerts/{id}/acknowledge` |  | AcknowledgeAlertRequest | AlertResponse |  |

## AuditLog

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/admin/audit-log/export` | EntityType, From, To, ThroughAuditId |  |  |  |
| GET | `/api/admin/audit-log` | EntityType, From, To, ThroughAuditId, Page, PageSize |  | AuditLogPage |  |

## Auth

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/auth/me` |  |  | MeResponse | Thông tin người đang đăng nhập |
| POST | `/api/auth/login` |  | LoginRequest | AuthResponse | Đăng nhập, nhận JWT |
| POST | `/api/auth/register` |  | RegisterRequest | AuthResponse | UC01 — Đăng ký tài khoản khách hàng hoặc nhà đầu tư |

## BatchProgress

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/batches/{code}/progress` |  |  | BatchProgressResponse | Tiến độ Lô: công khai số cua đang nuôi và số ngày nuôi; người tham gia thấy thêm số chết, thả bù (BR-143) |

## Batches

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/batches/{code}` |  |  |  |  |
| GET | `/api/batches` | Scope, CrabType, BatchMode, Latitude, Longitude, Page, PageSize |  | PagedResultOfExploreBatchResponse | WF-03/04 — Lô đang gọi vốn hoặc nhận đặt trước (BR-056, BR-084) |
| GET | `/api/operators/me/batches/{code}` |  |  | BatchResponse |  |
| GET | `/api/operators/me/batches` | Status, BatchMode, Page, PageSize |  | PagedResultOfBatchResponse |  |
| GET | `/api/specs` | crabType |  | SpecResponse[] | Bảng quy cách hàng (SKU) dùng cho chào giá và đặt trước (BR-043) |
| POST | `/api/batches/{code}/actual-costs` |  | CostActualRequest |  | Ghi chi phí thực tế kèm chứng từ (BR-037) |
| POST | `/api/batches/{code}/cancel` |  | CancelBatchRequest | BatchResponse | Huỷ Lô trước khi mở, khi chưa có khoản góp được xác nhận (BR-054) |
| POST | `/api/batches/{code}/submit` |  |  | BatchResponse |  |
| POST | `/api/batches` |  | BatchRequest | BatchResponse | WF-02 — Người nuôi tạo lô P nháp (BR-018) |
| PUT | `/api/batches/{code}/cost-plan` |  | CostPlanRequest | BatchResponse | Kế hoạch chi phí và mốc giải ngân (BR-030…036, BR-145) |
| PUT | `/api/batches/{code}` |  | BatchRequest | BatchResponse |  |

## Boxes

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/boxes` | Status, Search, BatchCode, Page, PageSize |  |  |  |
| PATCH | `/api/boxes/{slotCode}` |  | UpdateBoxRequest |  |  |
| POST | `/api/boxes/range` |  | BoxRangeRequest |  |  |
| POST | `/api/boxes` |  | CreateBoxRequest |  |  |

## CaptureRequests

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/operators/me/capture-requests` | Status, Page, PageSize |  | PagedResultOfCaptureRequestResponse |  |

## Claims

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/admin/claims` | status |  | ClaimResponse[] |  |
| GET | `/api/claims/{claimNo}/photo` |  |  |  |  |
| GET | `/api/claims/{claimNo}` |  |  | ClaimResponse |  |
| GET | `/api/operators/me/claims` | status |  | ClaimResponse[] |  |
| POST | `/api/admin/claims/{claimNo}/decide` |  | AdminClaimDecisionRequest | ClaimResponse | Admin quyết định cuối (BR-174) |
| POST | `/api/claims/{claimNo}/customer-reply` |  | CustomerReplyRequest | ClaimResponse | Khách đồng ý thì chốt; không đồng ý thì chuyển Admin |
| POST | `/api/claims/{claimNo}/respond` |  | RespondClaimRequest | ClaimResponse | Người nuôi chấp nhận hoặc từ chối trong hạn phản hồi |
| POST | `/api/preorders/{orderNo}/claims` |  | { ShipmentNo?: string SpecCode?: string ClaimType?: string IssueType?: string AffectedCrabs?: number AffectedKg?: number Description?: string Photo?: IFormFile } [form] | ClaimResponse | Khách gửi khiếu nại hoặc trả hàng trong hạn đổi trả, kèm ảnh chụp trong app (BR-172) |
| POST | `/api/preorders/{orderNo}/rating` |  | RateOrderRequest | OrderRatingResponse | Khách đánh giá đơn đã giao, mỗi đơn một lần (BR-176) |

## CollectiveDecisions

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/batches/{code}/decisions` |  |  | DecisionResponse[] |  |
| GET | `/api/batches/{code}/money-summary` |  |  | MoneySummaryResponse | Ba số: đã góp, đã giải ngân theo mốc, còn giữ trong tài khoản của Lô (BR-232) |
| GET | `/api/batches/{code}/settlement-readiness` |  |  | SettlementReadinessResponse | Sáu điều kiện chờ quyết toán và điều kiện nào còn thiếu (BR-183) |
| POST | `/api/batches/{code}/decisions` |  | ProposeDecisionRequest | DecisionResponse | Mở biểu quyết tập thể: thanh lý sớm hoặc bán phần dư (BR-182, BR-210, BR-211) |
| POST | `/api/decisions/{decisionNo}/votes` |  | CastVoteRequest | DecisionResponse | Nhà đầu tư biểu quyết, trọng số bằng vốn đã chốt |

## Contracts

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/admin/batches/{code}/contracts` |  |  | ContractSummary[] | Kho hợp đồng của một lô (admin xem / tải) |
| GET | `/api/contracts/{id}/file` |  |  |  | Tải file PDF hiện hành của hợp đồng (bản cuối khi đã đủ chữ ký); mã băm được kiểm tra lại trước khi trả |
| GET | `/api/contracts/{id}` |  |  | ContractResponse | Thông tin hợp đồng + chữ ký; nhà đầu tư của khoản góp, hộ nuôi của lô hoặc admin |
| GET | `/api/me/contracts` |  |  | ContractSummary[] | Hợp đồng của các khoản góp của tôi (tab Hợp đồng trong cổng nhà đầu tư) |
| GET | `/api/operator/contracts` |  |  | ContractSummary[] | Hợp đồng các lô của hộ nuôi tôi: chờ ký trước |
| POST | `/api/contracts/{id}/offline-upload` |  | Record<string, unknown> [form] | ContractResponse | UC15 — Tải bản hợp đồng đã ký ngoài hệ thống (PDF ≤ 10 MB, confirmedBothSigned = true) → FullySigned, OfflineUpload |
| POST | `/api/contracts/{id}/sign` |  |  | ContractResponse | UC14 — Ký phần của tôi: chủ hộ nuôi ký trước, nhà đầu tư ký sau (sai thứ tự → 422 contract.wrong_signing_order) |
| POST | `/api/contributions/{id}/contract` |  |  | ContractResponse | UC14 — Lập hợp đồng từ mẫu đang hiệu lực cho khoản góp của tôi (201); đã có thì trả lại đúng hợp đồng đó (200) |

## Delivery

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/batches/{code}/allocations` |  |  | AllocationResponse[] | Phân bổ hàng của Lô (BR-160) |
| GET | `/api/batches/{code}/delivery-tranches` |  |  | TrancheStatusResponse[] | Các đợt giao của Lô kèm số con đã phân bổ theo từng dòng |
| GET | `/api/preorders/{orderNo}/deliveries` |  |  | OrderDeliveriesResponse | Chuyến giao, nghiệm thu, hoá đơn và phần còn lại của một đơn |
| GET | `/api/shipments/{shipmentNo}` |  |  | ShipmentResponse |  |
| POST | `/api/delivery-tranches/{id}/cancel` |  | CancelTrancheRequest | OrderDeliveriesResponse | Huỷ đợt chưa xuất vì thiếu cua; đợt cuối thì hoàn phần cọc chưa dùng (BR-160) |
| POST | `/api/delivery-tranches/{id}/shipments` |  | CreateShipmentRequest | ShipmentResponse | Lập chuyến giao cho đợt; bù cua còn thiếu, cho phép thay cua cùng size hạng cao hơn; phát QR đơn |
| POST | `/api/shipments/{shipmentNo}/acceptance/confirm` |  |  | ShipmentResponse | Khách xác nhận nghiệm thu: tiền hàng, trừ cọc, phần còn lại qua VietQR, hoá đơn đợt (BR-166 – BR-171) |
| POST | `/api/shipments/{shipmentNo}/acceptance/refuse` |  | RefuseDeliveryRequest | ShipmentResponse | Khách từ chối nhận: mất cọc, cua quay về để bán lại (BR-169) |
| POST | `/api/shipments/{shipmentNo}/dispatch` |  | DispatchRequest | ShipmentResponse | Xuất hàng, cân lần một theo từng dòng (BR-164) |
| POST | `/api/shipments/{shipmentNo}/receipt` |  | ReceiptRequest | ShipmentResponse | Ghi cân lần hai khi nhận và lập biên bản nghiệm thu chờ khách xác nhận (BR-165) |

## DevPayments

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| POST | `/api/dev/payments/simulate` |  | SimulatePaymentRequest | WebhookResult | Công cụ demo — giả lập ngân hàng báo có cho một mã đối chiếu (để trống amount thì chuyển đúng số tiền yêu cầu) |

## DevSettlements

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| POST | `/api/dev/settlements/{id}/end-feedback-window` |  |  | SettlementResponse | Công cụ demo — kết thúc hạn góp ý ngay (dời mốc công bố về quá khứ, giữ cửa sổ ≥ 7 ngày) để duyệt được |

## DeviceManagement

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/admin/devices` | operatorId |  | DeviceResponse[] |  |
| GET | `/api/batches/{code}/device-images` | slotCode |  | DeviceImageResponse[] |  |
| GET | `/api/batches/{code}/water-readings` | from, to |  | WaterReadingResponse[] | Chỉ số nước của đợt lưu nuôi, chỉ để vẽ biểu đồ (BR-115) |
| GET | `/api/device-images/{id}/file` |  |  |  |  |
| GET | `/api/operators/me/devices` |  |  | DeviceResponse[] |  |
| POST | `/api/admin/devices/{code}/remove` |  |  | DeviceResponse |  |
| POST | `/api/admin/devices/{code}/rotate-key` |  |  |  |  |
| POST | `/api/admin/devices` |  | RegisterDeviceRequest | DeviceRegisteredResponse | Admin đăng ký thiết bị với mã, loại, phạm vi; khoá thiết bị chỉ trả về một lần (BR-116, BR-230) |
| POST | `/api/devices/{code}/calibrations` |  | ManualCalibrationRequest | DeviceResponse | Ghi hiệu chuẩn tay (quả cân chuẩn, dung dịch chuẩn) vào nhật ký kiểm toán (BR-225) |
| POST | `/api/devices/{code}/commands` |  | DeviceCommandRequest | DeviceCommandResponse | Lệnh cho camera chạy dàn: quét dàn, quét một hộp khi có cảnh báo, về chỗ đỗ |

## Devices

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/devices/{code}/commands` |  |  | DeviceCommandResponse[] |  |
| GET | `/api/devices/{code}/open-session` |  |  | OpenSessionResponse |  |
| POST | `/api/devices/calibration` |  | CalibrationMessage | IngestAccepted |  |
| POST | `/api/devices/commands/{id}/ack` | deviceCode |  |  |  |
| POST | `/api/devices/heartbeat` |  | HeartbeatMessage | HeartbeatResponse |  |
| POST | `/api/devices/ingest/box-images` |  | { meta?: string image?: IFormFile } [form] | IngestAccepted |  |
| POST | `/api/devices/ingest/measurements` |  | { meta?: string white?: IFormFile red?: IFormFile } [form] | IngestAccepted |  |
| POST | `/api/devices/ingest/water-readings` |  | WaterReadingMessage | IngestAccepted |  |

## DirectSales

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/batches/{code}/direct-sales` |  |  | DirectSaleResponse[] |  |
| GET | `/api/batches/{code}/sellable-crabs` |  |  | SellableCrab[] | Cua đã duyệt hạng còn trong tồn, chưa phân bổ |
| GET | `/api/direct-sales/{orderNo}` |  |  | DirectSaleResponse |  |
| POST | `/api/batches/{code}/final-order` |  | FinalOrderRequest | DirectSaleResponse | Đơn hàng cuối cho bên cam kết thu mua, đơn giá không dưới giá sàn (BR-179 – BR-181) |
| POST | `/api/batches/{code}/invoiced-sales` |  | InvoicedSaleRequest | DirectSaleResponse | Đơn có hoá đơn: dưới chuẩn, bán lại do mất cọc, phần dư (BR-169, BR-177, BR-182) |
| POST | `/api/direct-sales/{orderNo}/cancel` |  | CancelDirectSaleRequest | DirectSaleResponse | Huỷ đơn chưa thu tiền; với đơn hàng cuối là ghi bên cam kết không mua (BR-182) |

## Disbursements

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/admin/tranches` | status |  | TrancheResponse[] | Đợt giải ngân cho admin; mặc định các đợt đang chờ (Requested, NeedsExplanation) |
| GET | `/api/operator/tranches` |  |  | TrancheResponse[] | Các đợt giải ngân của lô thuộc hộ nuôi tôi, kèm lý do chưa xin được |
| POST | `/api/admin/tranches/{id}/block` |  | TrancheDecisionRequest | TrancheResponse | Dừng chi đợt này |
| POST | `/api/admin/tranches/{id}/need-explanation` |  | TrancheDecisionRequest | TrancheResponse | Yêu cầu người nuôi giải trình trong 72 giờ (TL-03 §6.4) |
| POST | `/api/admin/tranches/{id}/release` |  |  | TrancheResponse | Duyệt giải ngân → lệnh chi Disbursement (Created) tới tài khoản nhận tiền của hộ nuôi |
| POST | `/api/batches/{code}/tranches/{no}/request` |  |  | TrancheResponse | UC18 — Chủ hộ nuôi xin giải ngân đợt no; điều kiện mốc chưa đạt → 422 tranche.not_eligible |

## Evidence

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| POST | `/api/evidence` |  | { BatchCode?: string SlotCode?: string TagCode?: string SlotEventType?: string CapturedAt?: string Latitude?: number Longitude?: number CaptureRequestId?: number Image?: IFormFile } [form] | EvidenceResponse |  |

## EvidenceExplanations

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/operators/me/evidence/{id}/image` |  |  |  |  |
| GET | `/api/operators/me/evidence/{id}` |  |  | OperatorEvidenceItem |  |
| GET | `/api/operators/me/evidence` | Status, Q, Page, PageSize |  | PagedResultOfOperatorEvidenceItem |  |
| POST | `/api/evidence/{id}/explanation` |  | EvidenceExplanationRequest | OperatorEvidenceItem |  |

## EvidenceReview

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/review/evidence/{id}/image` |  |  |  |  |
| GET | `/api/review/evidence/{id}` |  |  | ReviewEvidenceDetail |  |
| GET | `/api/review/evidence` | Status, Q, Page, PageSize |  | PagedResultOfReviewEvidenceSummary |  |
| POST | `/api/review/evidence/{id}/verdict` |  | EvidenceVerdictRequest | ReviewEvidenceDetail |  |

## Funding

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| DELETE | `/api/contributions/{id}` |  |  |  | Huỷ khoản đang giữ chỗ (chưa thanh toán) |
| GET | `/api/funding/batches/{code}` |  |  | FundingBatchResponse | Số liệu gọi vốn của một lô + điều kiện của tôi + khoản tôi đang giữ chỗ |
| GET | `/api/funding/batches` |  |  | FundingBatchSummary[] | Các lô đang mở gọi vốn |
| GET | `/api/me/contributions` |  |  | ContributionResponse[] | Các khoản góp của tôi |
| GET | `/api/risk-disclosures/active` |  |  | RiskDisclosureResponse | UC11 — Bản công bố rủi ro đang hiệu lực (kèm thời điểm tôi đã xác nhận, nếu có) |
| POST | `/api/batches/{code}/contributions` |  | ReserveContributionRequest | ContributionResponse | UC10 — Giữ chỗ góp vốn: cần đã eKYC + đã xác nhận rủi ro; không vượt max_capital |
| POST | `/api/contributions/{id}/payment-requests` |  |  | PaymentRequestResponse | UC12 — Mã VietQR cho khoản đang giữ chỗ; gọi lại khi mã còn hạn thì trả đúng mã đó (200), không sinh mã mới |
| POST | `/api/risk-acknowledgements` |  | AcknowledgeRiskRequest | RiskAcknowledgementResponse | UC11 — Xác nhận đã đọc hết bản công bố rủi ro (scrolledToEnd phải là true) |

## FundingAdmin

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/admin/funding/batches` |  |  | AdminFundingBatch[] | Vốn vào theo lô: đã giữ chỗ / đã xác nhận / mục tiêu, trạng thái chốt vốn, số lệnh hoàn |
| POST | `/api/admin/funding/close-due` |  |  | FundingCloseResult | Chạy ngay việc của job chốt vốn (job tự chạy mỗi phút): hết hạn giữ chỗ, chốt hoặc huỷ các lô tới hạn |

## Grading

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/batches/{code}/grade-decisions` | status |  | GradeDecisionResponse[] | Quyết định phân hạng hiện hành của Lô, lọc theo trạng thái |
| GET | `/api/batches/{code}/grading` |  |  | BatchGradingSummary | Tổng hợp phân hạng của Lô |
| GET | `/api/crab-units/{crabCode}/grade-decisions` |  |  | GradeDecisionResponse[] | Lịch sử quyết định phân hạng của một con cua (BR-157) |
| GET | `/api/grade-decisions/{decisionNo}/photo` |  |  |  |  |
| GET | `/api/grade-decisions/{decisionNo}` |  |  | GradeDecisionResponse |  |
| GET | `/api/measurement-sessions/{sessionNo}/images/{kind}` |  |  |  | Ảnh lượt đo: white (đèn trắng) hoặc red (soi đỏ) |
| GET | `/api/measurement-sessions/{sessionNo}/measurements` |  |  | SessionMeasurementsResponse | Số đo, kết quả AI và quyết định hiện hành của lượt đo |
| POST | `/api/admin/batches/{code}/grading-qc` |  |  | BatchGradingSummary | Phân công ngẫu nhiên Nhân viên kiểm phẩm cho buổi đo của Lô khi lúc đo pool còn trống (BR-017) |
| POST | `/api/grade-decisions/{decisionNo}/approve` |  | ApproveDecisionRequest | GradeDecisionResponse | Nhân viên kiểm phẩm duyệt hạng cuối sau kiểm cảm quan (BR-155) |
| POST | `/api/grade-decisions/{decisionNo}/confirm-hold` |  |  | GradeDecisionResponse |  |
| POST | `/api/grade-decisions/{decisionNo}/hold` |  | HoldDecisionRequest | GradeDecisionResponse | Giữ lại để kiểm thêm; cần Nhân viên kiểm phẩm thứ hai xác nhận (BR-017) |
| POST | `/api/grade-decisions/{decisionNo}/reject` |  | { LiveStatus?: string FoodSafety?: string Reason?: string Photo?: IFormFile } [form] | GradeDecisionResponse | Loại bỏ cua chết, yếu nặng hoặc không an toàn, kèm ảnh chụp trong app (BR-156) |
| POST | `/api/grade-decisions/{decisionNo}/revise` |  | { FinalSize?: string FinalGrade?: string Reason?: string Photo?: IFormFile } [form] | GradeDecisionResponse | Đổi size hoặc hạng cuối: tạo phiên bản quyết định mới kèm ảnh và lý do (BR-157) |
| POST | `/api/measurement-sessions/{sessionNo}/process` |  |  | SessionMeasurementsResponse | Chạy lại xử lý lượt đo đã nhận bản tin của trạm mà chưa có số đo |
| POST | `/api/measurement-sessions/{sessionNo}/values` |  | MeasurementValuesRequest | SessionMeasurementsResponse | Nhập số đo tay: cân tay và thước kẹp (lượt đo Manual) hoặc thước kẹp khi ảnh lỗi, AI không chắc (BR-226) |

## GradingStandards

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/admin/grade-rule-sets` |  |  | GradingStandardResponse[] |  |
| GET | `/api/grading/standards` |  |  | GradingStandardResponse[] | Chuẩn phân hạng và bộ quy tắc đang áp dụng (chuẩn nội bộ tham chiếu, không phải chứng nhận) |
| POST | `/api/admin/grade-rule-sets/{id}/activate` |  |  | GradeRuleSetResponse | Áp dụng bản nháp; bộ cũ chuyển Retired, Lô đã duyệt vẫn dùng bộ cũ (BR-038) |
| POST | `/api/admin/grade-rule-sets` |  | CreateRuleSetRequest | GradeRuleSetResponse | Tạo bản nháp bộ quy tắc mới (chép bộ đang áp dụng nếu không gửi quy tắc) |
| PUT | `/api/admin/grade-rule-sets/{id}/rules` |  | ReplaceRulesRequest | GradeRuleSetResponse |  |

## Health

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/health/live` |  |  |  |  |
| GET | `/api/health/ready` |  |  |  |  |
| GET | `/api/health/version` |  |  |  |  |

## Holding

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/batches/{code}/boxes` |  |  | BoxStateResponse[] |  |
| GET | `/api/batches/{code}/crab-units` | status |  | CrabUnitResponse[] |  |
| GET | `/api/batches/{code}/holding` |  |  | HoldingResponse |  |
| GET | `/api/crab-units/{crabCode}` |  |  | CrabUnitResponse | Chi tiết một con cua: lô nguồn, các hộp đã ở, sự kiện tồn (BR-102, BR-142) |
| POST | `/api/batches/{code}/box-assignments` |  | BoxRequest | CrabUnitResponse | Xếp con cua vào hộp trống kèm ảnh hộp; thả bù thay con đã chết (BR-106…108, BR-120) |
| POST | `/api/crab-units/{crabCode}/events` |  | CrabEventRequest | CrabUnitResponse | Ghi sự kiện của một con: chết (kèm ảnh), lột xác, ăn khác thường, kiểm tra |
| POST | `/api/crab-units/{crabCode}/move` |  | MoveRequest | CrabUnitResponse |  |

## MeasurementSessions

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/measurement-sessions/{sessionNo}` |  |  | SessionResponse |  |
| POST | `/api/batches/{code}/start-harvest` |  |  |  | Bắt đầu thu hoạch: Lô chuyển Harvesting, từng con được đưa qua trạm đo (BR-150) |
| POST | `/api/measurement-sessions/{sessionNo}/cancel` |  |  | SessionResponse |  |
| POST | `/api/measurement-sessions` |  | OpenSessionRequest | SessionResponse | Mở lượt đo với mã cua trước khi đặt cua vào trạm (BR-224) |

## MyParty

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| DELETE | `/api/me/party/documents/{documentId}` |  |  |  |  |
| DELETE | `/api/me/related-parties/{id}` |  |  |  |  |
| DELETE | `/api/me/sites/{siteId}` |  |  |  |  |
| GET | `/api/me/party/documents/{documentId}/file` |  |  |  |  |
| GET | `/api/me/party/documents` |  |  | PartyDocumentResponse[] | Giấy tờ pháp lý tôi đã gửi để Admin xác minh (đối tác tổ chức) |
| GET | `/api/me/party` |  |  | PartyResponse | Hồ sơ đối tác của tôi, các vai trò và địa điểm |
| GET | `/api/me/related-parties` |  |  | RelatedPartyResponse[] | Bên liên quan của người nuôi (BR-008) |
| GET | `/api/me/sites` | siteType |  | PartySiteResponse[] | Địa điểm của tôi: trại, trạm kiểm phẩm, kho, địa chỉ giao |
| POST | `/api/me/party/documents` |  | { DocType?: string Note?: string File?: IFormFile } [form] | PartyDocumentResponse | Gửi ảnh giấy tờ pháp lý; đối tác chưa xác minh chuyển sang chờ Admin xem (BR-009) |
| POST | `/api/me/related-parties` |  | RelatedPartyRequest | RelatedPartyResponse |  |
| POST | `/api/me/sites` |  | SiteRequest | PartySiteResponse |  |
| PUT | `/api/me/party` |  | UpdatePartyRequest | PartyResponse | Sửa hồ sơ đối tác; đổi tên pháp lý thì phải xác minh lại |
| PUT | `/api/me/sites/{siteId}` |  | SiteRequest | PartySiteResponse |  |

## Notifications

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/me/notifications` | After, Until, Page, PageSize |  | NotificationPage |  |

## OperatorDashboard

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/operators/me/dashboard` | From, To, BatchCode |  | OperatorDashboardResponse |  |

## Operators

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/operators/me/members` |  |  | OperatorMemberResponse[] |  |
| GET | `/api/operators/me` |  |  | OperatorResponse |  |
| POST | `/api/operators/me/submit` |  |  | OperatorResponse | UC04 — Gửi hồ sơ hộ nuôi xét duyệt |
| POST | `/api/operators` |  | OperatorProfileRequest | OperatorResponse | UC04 — Tạo hồ sơ hộ nuôi nháp |
| PUT | `/api/operators/me` |  | OperatorProfileRequest | OperatorResponse |  |

## OrderTrace

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/trace/orders/{traceCode}` |  |  | OrderTraceResponse | Quét QR đơn: Lô, trại, vùng xuất xứ, ngày thu của lô nguồn, quy cách đã duyệt; không có thông tin cá nhân |

## Parameters

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/admin/parameters` | history |  | ParameterValueResponse[] | Tham số nền tảng đang hiệu lực (BR-217); history=true để xem cả giá trị cũ |
| GET | `/api/parameters` |  |  | Record<string, number> | Tham số nền tảng web và mobile cần hiển thị |
| POST | `/api/admin/parameters` |  | ParameterChangeRequest | ParameterValueResponse | Đặt giá trị mới cho một tham số, có ngày hiệu lực (BR-218) |

## Parties

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/parties/directory` | roleType, search |  | PartySummaryResponse[] | Tra cứu nhà cung cấp hoặc bên cam kết thu mua đã xác minh |
| POST | `/api/parties/external` |  | ExternalPartyRequest | PartyResponse | Người nuôi ghi nhận nhà cung cấp hoặc bên cam kết thu mua; chờ Admin xác minh |

## PaymentProfiles

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| DELETE | `/api/me/addresses/{id}` |  |  |  |  |
| GET | `/api/me/addresses/{id}` |  |  | AddressResponse |  |
| GET | `/api/me/addresses` |  |  | AddressResponse[] |  |
| GET | `/api/me/payout-account` | ownerType |  | PayoutProfileResponse |  |
| POST | `/api/me/addresses` |  | AddressRequest | AddressResponse |  |
| PUT | `/api/me/addresses/{id}` |  | AddressRequest | AddressResponse |  |
| PUT | `/api/me/payout-account` | ownerType | PayoutAccountRequest | PayoutProfileResponse |  |

## PaymentWebhook

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| POST | `/api/webhooks/payment-provider` |  |  | WebhookResult | TH-06 — Trung gian thanh toán báo có một giao dịch vào tài khoản lô; idempotent theo providerTxnId, chữ ký HMAC-SHA256 ở header X-Signature |

## Payments

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/payment-requests/{id}` |  |  | PaymentRequestResponse | UC12 — Một yêu cầu chuyển khoản của tôi: trạng thái, và mã QR khi còn chờ thanh toán (màn hình hỏi lại vài giây một lần để biết tiền đã về) |

## Portfolio

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/investor/portfolio/{batchCode}` |  |  | PortfolioDetail |  |
| GET | `/api/investor/portfolio` | Status, Q, Page, PageSize |  | PortfolioPage |  |

## PreorderQueries

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/batches/{code}/availability` |  |  | AvailabilityResponse | Số con còn đặt trước được của Lô, chung và theo quy cách (BR-055, BR-089) |
| GET | `/api/operators/me/preorders` | batchCode, Page, PageSize |  | PagedResultOfPreorderResponse |  |

## Preorders

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/preorders/{orderNo}` |  |  | PreorderResponse |  |
| GET | `/api/preorders` | Page, PageSize |  | PagedResultOfPreorderResponse |  |
| POST | `/api/preorders/{orderNo}/cancel` |  | CancelPreorderRequest | PreorderResponse | Huỷ đơn: chưa cọc không mất gì; đã cọc khi Lô còn gọi vốn thì cọc giữ tới khi đóng gọi vốn; Lô đã mở thì mất cọc (BR-096, BR-097) |
| POST | `/api/preorders` |  | PreorderRequest | PreorderResponse | Đặt trước theo quy cách, theo số con hoặc kg; giữ đơn chờ cọc (BR-087…092, BR-234) |
| PUT | `/api/preorders/{orderNo}/tranches` |  | SplitTranchesRequest | PreorderResponse | Chia đơn thành các đợt giao trước khi Lô chuyển Selling (BR-234) |

## ProductionLogs

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/batches/{code}/production-logs` | From, To, Page, PageSize |  | PagedResultOfProductionLogResponse |  |
| GET | `/api/batches/{code}/production-thresholds` |  |  | ProductionThresholdState |  |
| GET | `/api/operators/me/production-batches` | Page, PageSize |  | PagedResultOfProductionBatchResponse |  |
| GET | `/api/operators/me/production-logs` | From, To, Page, PageSize |  | PagedResultOfProductionLogResponse |  |
| POST | `/api/batches/{code}/production-logs` |  | ProductionLogRequest | ProductionLogResponse |  |
| PUT | `/api/batches/{code}/production-thresholds` |  | ProductionThresholdRequest | ProductionThresholdResponse |  |

## QcTasks

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/qc/tasks` |  |  | QcTaskResponse[] | Việc được phân ngẫu nhiên cho Nhân viên kiểm phẩm (BR-017) |

## Settlements

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/me/settlements` |  |  | SettlementSummary[] | Bảng quyết toán đã công bố của các lô tôi góp vốn (tab Quyết toán của cổng nhà đầu tư) |
| GET | `/api/operator/settlements` |  |  | SettlementSummary[] | Bảng quyết toán đã công bố của các lô thuộc hộ nuôi tôi |
| GET | `/api/settlements/{id}` |  |  | SettlementResponse | UC35 — Sao kê quyết toán: nhà đầu tư thấy tổng + dòng của mình; người nuôi, admin thấy đủ |
| POST | `/api/admin/settlement-feedback/{id}/answer` |  | AnswerFeedbackRequest | SettlementResponse | Trả lời góp ý; unresolved = true khi hai bên chưa thống nhất (vẫn chốt được, kèm ghi chú công khai) |
| POST | `/api/admin/settlements/{id}/propose` |  | ProposeSettlementRequest | SettlementResponse | UC37 — Công bố bảng nháp cho nhà đầu tư và người nuôi, mở cửa sổ góp ý (mặc định 7 ngày, tối đa 14) |
| POST | `/api/settlements/{id}/feedback` |  | SettlementFeedbackRequest | SettlementResponse | UC36 — Góp ý bảng quyết toán trong hạn, kèm căn cứ; sau hạn → 422 settlement.feedback_closed |

## SiteVisits

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/batches/{code}/site-visits` |  |  | SiteVisitReportResponse[] |  |
| POST | `/api/admin/batches/{code}/site-visits` |  |  | QcTaskResponse | Phân ngẫu nhiên Nhân viên kiểm phẩm thăm trại giữa vụ (BR-233) |
| POST | `/api/qc/site-visits/{assignmentId}/report` |  | { Latitude?: number Longitude?: number BoxCodes?: string CrabsSeen?: number Findings?: string Photo?: IFormFile } [form] | SiteVisitReportResponse | Nhân viên kiểm phẩm lập biên bản thăm trại tại trại, kèm ảnh có vị trí và số hộp (BR-233) |

## Sourcing

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/batches/{code}/goods-receipts` |  |  | GoodsReceiptResponse[] |  |
| GET | `/api/batches/{code}/procurement-orders` |  |  | ProcurementOrderResponse[] |  |
| GET | `/api/goods-receipts/{receiptNo}` |  |  | GoodsReceiptResponse |  |
| POST | `/api/batches/{code}/procurement-orders` |  | ProcurementOrderRequest | ProcurementOrderResponse | Đơn mua nguồn: lô P chỉ mua sau khi Lô mở, trong số con được cấp vốn (BR-098) |
| POST | `/api/goods-receipts/{receiptNo}/complete` |  |  | GoodsReceiptResponse |  |
| POST | `/api/goods-receipts/{receiptNo}/inspections` |  | IncomingInspectionRequest | InspectionResponse | Nhân viên kiểm phẩm kiểm từng con; con đạt được gắn mã cua nội bộ (BR-100, BR-101) |
| POST | `/api/procurement-orders/{poNo}/receipts` |  | GoodsReceiptRequest | GoodsReceiptResponse | Nhận một lô nguồn bằng phiếu nhận hàng; hệ thống phân ngẫu nhiên Nhân viên kiểm phẩm (BR-017, BR-099) |

## Timeline

| Method | Path | Query | Body | Trả về | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/batches/{code}/timeline/evidence/{id}/file` |  |  |  |  |
| GET | `/api/batches/{code}/timeline` | Days, Before |  | TimelinePage | UC21 — Nhật trình sản xuất, phân trang trọn nhóm ngày UTC+7 |
