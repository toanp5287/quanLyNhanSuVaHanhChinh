PHẦN I. TỔNG QUAN CHỨC NĂNG

1. Mục tiêu

Xây dựng chức năng tái ký hợp đồng lao động nhằm hỗ trợ công ty theo dõi, đánh giá, phê duyệt và tạo hợp đồng mới cho nhân viên khi hợp đồng hiện tại sắp hết hạn.

Hệ thống cần hỗ trợ toàn bộ quy trình từ lúc phát hiện hợp đồng sắp hết hạn đến khi hoàn tất việc tái ký.

Các mục tiêu cụ thể:

Tự động phát hiện hợp đồng sắp hết hạn.

Thông báo cho người có trách nhiệm xử lý.

Hỗ trợ chuyên viên nhân sự lập đề xuất tái ký.

Hỗ trợ quản lý trực tiếp đánh giá nhân viên.

Hỗ trợ Ban giám đốc phê duyệt đề xuất.

Hỗ trợ chuyên viên C&B kiểm tra khi có thay đổi lương, phụ cấp.

Hỗ trợ chuyên viên phụ trách hợp đồng tạo hợp đồng mới.

Lưu trữ hợp đồng cũ và hợp đồng mới.

Theo dõi toàn bộ lịch sử xử lý.

Kiểm soát quyền truy cập theo chức vụ và quyền nghiệp vụ.

2. Phạm vi chức năng

Chức năng tái ký bao gồm:

Theo dõi hợp đồng sắp hết hạn.

Phát hiện hợp đồng cần xử lý.

Thông báo công việc.

Tạo đề xuất tái ký.

Quản lý đánh giá.

Kiểm tra thay đổi lương, phụ cấp nếu có.

Phê duyệt đề xuất.

Tạo hợp đồng mới.

Lưu trữ và quản lý lịch sử tái ký.

Theo dõi tiến độ xử lý.

Không triển khai các nghiệp vụ ngoài phạm vi tái ký như tuyển dụng mới, thanh lý hợp đồng hoặc quản lý nghỉ việc, trừ khi cần sử dụng dữ liệu có sẵn để phục vụ quy trình.

PHẦN II. NGUYÊN TẮC PHÂN QUYỀN

3. Nguyên tắc phân quyền chung

Bắt buộc tuân thủ các nguyên tắc:

Phân quyền theo chức vụ và quyền nghiệp vụ.

Một chức vụ có thể có nhiều tài khoản.

Một tài khoản chỉ được thao tác khi có quyền phù hợp.

Lưu tài khoản thực tế đã thực hiện để truy vết lịch sử.

Không gắn cứng mã nhân viên vào code.

Nếu cần giới hạn hồ sơ, kiểm tra thêm phạm vi được giao hoặc phạm vi quản lý.

Không mặc định một tài khoản cụ thể là người duy nhất thực hiện nghiệp vụ.

Khi tài khoản thay đổi chức vụ hoặc quyền, hệ thống phải áp dụng quyền mới theo dữ liệu phân quyền.

Không chỉ ẩn nút trên giao diện; phải kiểm tra quyền ở cả phía máy chủ.

Không cho phép tài khoản tự thực hiện bước phê duyệt nếu không có quyền tương ứng.

4. Phân biệt các khái niệm

4.1. Tài khoản

Là tài khoản đăng nhập hệ thống.

4.2. Nhân viên

Là người có hồ sơ nhân sự trong công ty.

4.3. Chức vụ

Là vị trí công việc mà nhân viên đang đảm nhiệm.

4.4. Quyền nghiệp vụ

Là quyền thực hiện một thao tác cụ thể trong hệ thống.

Ví dụ:

Tạo đề xuất tái ký.

Đánh giá đề xuất.

Phê duyệt đề xuất.

Tạo hợp đồng mới.

Kiểm tra thay đổi lương.

4.5. Người thực hiện

Là tài khoản thực tế thực hiện một thao tác.

Hệ thống phải lưu người thực hiện theo tài khoản đang đăng nhập, không sử dụng mã nhân viên cố định trong code.

5. Các chức vụ tham gia nghiệp vụ

Chức vụ

Trách nhiệm

Chuyên viên nhân sự

Theo dõi hợp đồng và lập đề xuất tái ký

Quản lý trực tiếp

Đánh giá nhân viên

Ban giám đốc

Phê duyệt hoặc từ chối đề xuất

Chuyên viên phụ trách hợp đồng

Tạo hợp đồng mới

Chuyên viên C&B

Kiểm tra thay đổi lương, phụ cấp khi cần

Lưu ý:

Đây là các chức vụ tham gia nghiệp vụ, không phải mã nhân viên cố định.

Các chức vụ phải được đối chiếu với dữ liệu chức vụ thực tế trong database.

Không tự ý tạo chức vụ mới nếu hệ thống đã có chức vụ tương đương.

Nếu một chức vụ có nhiều tài khoản, các tài khoản có quyền phù hợp đều có thể thực hiện công việc theo phạm vi được phép.

Nếu có nhiều người cùng đủ quyền, cần có cơ chế phân công, tiếp nhận hoặc giới hạn xử lý để tránh hai người xử lý cùng một hồ sơ ngoài ý muốn.

6. Quyền nghiệp vụ dự kiến

Các quyền dưới đây là quyền đề xuất. Trước khi triển khai phải kiểm tra hệ thống phân quyền hiện tại và tận dụng cấu trúc đang có.

Mã quyền

Ý nghĩa

contract_renewal.view

Xem hồ sơ tái ký

contract_renewal.track

Theo dõi hợp đồng sắp hết hạn

contract_renewal.create

Tạo đề xuất tái ký

contract_renewal.edit

Chỉnh sửa đề xuất khi được phép

contract_renewal.evaluate

Đánh giá đề xuất

contract_renewal.review_salary

Kiểm tra thay đổi lương, phụ cấp

contract_renewal.approve

Phê duyệt đề xuất

contract_renewal.reject

Từ chối đề xuất

contract.create

Tạo hợp đồng mới

contract.view

Xem hợp đồng theo phạm vi được cấp

contract.view.own

Nhân viên xem hợp đồng của chính mình

contract_renewal.history

Xem lịch sử xử lý

contract_renewal.history.own

Nhân viên xem lịch sử hợp đồng của chính mình

contract_renewal.assign

Giao việc, chọn người nhận và đổi người phụ trách

Yêu cầu:

Quyền phải được quản lý từ hệ thống phân quyền hiện có.

Không viết điều kiện kiểu employee_code = 'NV0006'.

Không kiểm tra quyền bằng cách so sánh mã tài khoản cố định.

Mỗi thao tác phải kiểm tra quyền tương ứng.

Nếu hệ thống đã có bảng roles, permissions hoặc bảng liên kết tương đương thì phải tái sử dụng.

Quyền `contract.view.own` và `contract_renewal.history.own` chỉ áp dụng cho hợp đồng có employee_id bằng employee_id của tài khoản đang đăng nhập; không cho xem hợp đồng của nhân viên khác.

Các bước có người phụ trách phải kiểm tra thêm quyền điều phối hoặc quyền xử lý tương ứng, không chỉ dựa vào vai trò.

PHẦN III. QUY TRÌNH NGHIỆP VỤ

7. Quy trình tổng thể

Quy trình tái ký hợp đồng được thực hiện theo thứ tự:

Bước 1: Hệ thống tự động phát hiện hợp đồng sắp hết hạn.

Bước 2: Chuyên viên nhân sự theo dõi hợp đồng và kiểm tra thông tin nhân viên.

Bước 3: Chuyên viên nhân sự tạo đề xuất tái ký.

Bước 4: Quản lý trực tiếp đánh giá nhân viên.

Bước 5: Nếu có thay đổi lương hoặc phụ cấp, chuyên viên C&B kiểm tra và xác nhận nội dung thay đổi.

Bước 6: Ban giám đốc xem xét và phê duyệt đề xuất.

Bước 7: Chuyên viên phụ trách hợp đồng tạo hợp đồng mới theo nội dung đã được phê duyệt.

Bước 8: Thực hiện ký kết, lưu file hợp đồng hoàn thiện gắn với hợp đồng mới và hồ sơ tái ký; không chỉnh sửa hợp đồng cũ.

Bước 9: Hệ thống hoàn tất hồ sơ và lưu lịch sử.

Lưu ý: Bước C&B là nhánh điều kiện. Nếu không có thay đổi lương, phụ cấp thì bỏ qua bước này. Kết quả kiểm tra C&B phải có trước khi Ban giám đốc phê duyệt nội dung có thay đổi đãi ngộ.

8. Bước 1 - Phát hiện hợp đồng sắp hết hạn

Mục tiêu

Hệ thống tự động kiểm tra hợp đồng của tất cả nhân viên để xác định hợp đồng cần theo dõi.

Điều kiện kiểm tra

Hợp đồng có ngày kết thúc.

Hợp đồng đang ở trạng thái có hiệu lực hoặc trạng thái phù hợp theo quy tắc hệ thống.

Hợp đồng chưa bị hủy.

Hợp đồng chưa được thay thế hoặc xử lý theo một quy trình khác.

Nhân viên và hợp đồng tồn tại hợp lệ.

Các mốc theo dõi

Có thể cấu hình các mốc:

Trước 90 ngày.

Trước 60 ngày.

Trước 30 ngày.

Đã hết hạn.

Các mốc trên phải được thiết kế để có thể thay đổi, không viết cố định ở nhiều vị trí trong code.

Công việc cần thực hiện

Lấy danh sách hợp đồng.

Kiểm tra ngày kết thúc.

Tính số ngày còn lại.

Phân loại theo từng mốc.

Loại bỏ hợp đồng không hợp lệ.

Kiểm tra hợp đồng đã được đưa vào danh sách theo dõi chưa.

Không tạo dữ liệu hoặc thông báo trùng lặp.

Hiển thị danh sách hợp đồng cần theo dõi.

Gửi thông báo cho tài khoản có quyền và phạm vi theo dõi phù hợp.

Thông tin hiển thị

Mã hợp đồng.

Mã nhân viên.

Họ tên.

Phòng ban.

Chức vụ.

Loại hợp đồng.

Ngày bắt đầu.

Ngày kết thúc.

Số ngày còn lại.

Trạng thái hợp đồng.

Trạng thái xử lý tái ký.

Trạng thái theo dõi

Sắp hết hạn.

Còn 60 ngày.

Còn 30 ngày.

Đã hết hạn.

Đang xử lý tái ký.

Đã hoàn tất tái ký.

Không tiếp tục tái ký.

Không được nhầm trạng thái theo dõi hợp đồng với trạng thái của hồ sơ đề xuất tái ký.

9. Bước 2 - Chuyên viên nhân sự kiểm tra hợp đồng

Mục tiêu

Kiểm tra dữ liệu trước khi lập đề xuất.

Công việc

Mở danh sách hợp đồng sắp hết hạn.

Chọn hợp đồng cần xử lý.

Xem thông tin nhân viên.

Xem thông tin hợp đồng hiện tại.

Kiểm tra thời hạn hợp đồng.

Kiểm tra mức lương hiện tại.

Kiểm tra phụ cấp và các thông tin liên quan.

Xác định thông tin còn thiếu.

Xác định có thể lập đề xuất hay cần bổ sung dữ liệu.

Điều kiện

Chỉ người có quyền phù hợp mới được thao tác.

Không cho lập nhiều đề xuất đang hoạt động cho cùng một hợp đồng cũ nếu chưa xử lý hồ sơ trước đó.

Không cho lập đề xuất từ hợp đồng đã bị hủy hoặc không đủ điều kiện.

10. Bước 3 - Tạo đề xuất tái ký

Mục tiêu

Lưu đề xuất tiếp tục hợp đồng cho nhân viên.

Thông tin đề xuất

A. Thông tin nhân viên

Nhân viên.

Mã nhân viên.

Họ tên.

Phòng ban.

Chức vụ.

Các thông tin này nên lấy từ hồ sơ nhân viên hiện tại, không yêu cầu nhập lại nếu database đã có.

B. Thông tin hợp đồng cũ

Mã hợp đồng.

Loại hợp đồng.

Ngày bắt đầu.

Ngày kết thúc.

Mức lương hiện tại.

Phụ cấp hiện tại.

C. Nội dung đề xuất

Thời hạn hợp đồng dự kiến.

Ngày bắt đầu dự kiến.

Ngày kết thúc dự kiến.

Đề xuất giữ nguyên hoặc thay đổi lương.

Đề xuất giữ nguyên hoặc thay đổi phụ cấp.

Lý do tái ký.

Nội dung đề xuất khác.

Ghi chú.

D. Thông tin hệ thống tự lưu

Người tạo đề xuất.

Thời gian tạo.

Trạng thái hồ sơ.

Hợp đồng cũ liên quan.

Quy tắc

Người tạo phải có quyền contract_renewal.create.

Không gắn cứng tài khoản cụ thể.

Người tạo được ghi nhận từ tài khoản đang đăng nhập.

Kiểm tra các trường bắt buộc.

Không cho nhập ngày kết thúc trước ngày bắt đầu.

Không ghi đè thông tin hợp đồng cũ.

Không cho sửa hồ sơ sau khi gửi đánh giá, trừ trường hợp được trả lại để bổ sung.

Sau khi gửi đề xuất

Lưu đề xuất.

Chuyển trạng thái sang pending_evaluation.

Lưu lịch sử.

Gửi thông báo cho quản lý trực tiếp phù hợp.

11. Bước 4 - Quản lý trực tiếp đánh giá

Mục tiêu

Quản lý trực tiếp xem xét khả năng tiếp tục sử dụng nhân viên.

Thông tin cần hiển thị

Thông tin nhân viên.

Hợp đồng hiện tại.

Nội dung đề xuất.

Thời hạn hợp đồng dự kiến.

Đề xuất thay đổi lương, phụ cấp nếu có.

Các thao tác

Đồng ý đề xuất tái ký.

Không đồng ý đề xuất tái ký.

Yêu cầu bổ sung thông tin.

Nội dung đánh giá

Kết quả đánh giá nhân viên.

Nhận xét.

Kiến nghị.

Lý do không đồng ý nếu có.

Người đánh giá.

Thời gian đánh giá.

Quy tắc

Người đánh giá phải có quyền contract_renewal.evaluate.

Phải kiểm tra người đó có phải quản lý trực tiếp hoặc có phạm vi quản lý phù hợp hay không.

Không chỉ dựa vào việc tài khoản có chức vụ quản lý.

Không cho người không có quyền đánh giá hồ sơ.

Không cho đánh giá một hồ sơ đã được xử lý hoặc đã kết thúc.

Kết quả

Nếu đồng ý:

Lưu đánh giá.

Chuyển đến bước C&B nếu có thay đổi lương, phụ cấp.

Nếu không có thay đổi thì chuyển sang chờ Ban giám đốc phê duyệt.

Nếu không đồng ý:

Lưu lý do.

Chuyển hồ sơ sang trạng thái rejected hoặc trạng thái từ chối ở bước đánh giá theo thiết kế.

Thông báo cho người liên quan.

Nếu yêu cầu bổ sung:

Chuyển trạng thái needs_revision.

Gửi thông báo cho người tạo đề xuất.

Lưu nội dung cần bổ sung.

12. Bước 5 - C&B kiểm tra thay đổi lương, phụ cấp

Điều kiện tham gia

Chỉ chuyển đến C&B khi đề xuất có thay đổi lương, phụ cấp hoặc nội dung thuộc phạm vi kiểm tra chế độ đãi ngộ.

Nếu không có thay đổi thì bỏ qua bước này.

Thông tin cần kiểm tra

Lương hiện tại.

Lương đề xuất.

Phụ cấp hiện tại.

Phụ cấp đề xuất.

Nội dung thay đổi.

Lý do thay đổi.

Các thao tác

Xác nhận thông tin hợp lệ.

Yêu cầu điều chỉnh.

Từ chối nội dung thay đổi và ghi rõ lý do.

Quy tắc

Người thực hiện phải có quyền contract_renewal.review_salary.

Lưu người kiểm tra và thời gian kiểm tra.

Không tự ý thay đổi nội dung đã được phê duyệt.

Nếu nội dung cần điều chỉnh thì chuyển lại đúng bước cần xử lý.

Kết quả kiểm tra phải được lưu để Ban giám đốc xem xét.

Sau khi hoàn tất kiểm tra, chuyển hồ sơ sang pending_approval.

13. Bước 6 - Ban giám đốc phê duyệt

Mục tiêu

Ban giám đốc quyết định có tiếp tục tái ký hợp đồng hay không.

Thông tin cần hiển thị

Thông tin nhân viên.

Hợp đồng cũ.

Nội dung đề xuất.

Đánh giá của quản lý.

Kết quả C&B nếu có thay đổi lương, phụ cấp.

Các tài liệu liên quan.

Các thao tác

Phê duyệt.

Từ chối.

Yêu cầu bổ sung thông tin.

Quy tắc

Người phê duyệt phải có quyền contract_renewal.approve.

Phải kiểm tra phạm vi và thẩm quyền phê duyệt.

Không cho tài khoản không có quyền phê duyệt.

Không cho phê duyệt hồ sơ chưa qua các bước bắt buộc.

Lưu người phê duyệt.

Lưu thời gian phê duyệt.

Lưu kết quả và ghi chú.

Kết quả

Nếu phê duyệt:

Chuyển trạng thái approved.

Thông báo cho người có quyền tạo hợp đồng.

Chuyển hồ sơ sang pending_contract.

Nếu từ chối:

Chuyển trạng thái rejected.

Bắt buộc lưu lý do.

Thông báo cho người tạo đề xuất và các bên liên quan.

Nếu yêu cầu bổ sung:

Chuyển trạng thái needs_revision.

Ghi rõ nội dung cần bổ sung.

Chuyển về đúng bước xử lý cần thực hiện lại.

14. Bước 7 - Tạo hợp đồng mới

Mục tiêu

Tạo hợp đồng mới dựa trên nội dung đã được phê duyệt.

Thông tin hợp đồng mới

Mã hợp đồng mới.

Nhân viên.

Hợp đồng cũ liên quan.

Loại hợp đồng.

Ngày bắt đầu.

Ngày kết thúc.

Mức lương.

Phụ cấp.

Điều khoản hợp đồng.

Ghi chú.

File hợp đồng hoàn thiện: khi hoàn tất phải lưu file gắn với hợp đồng mới và hồ sơ tái ký; không ghi đè file hợp đồng cũ.

Quy tắc

Chỉ tài khoản có quyền contract.create mới được tạo hợp đồng.

Phải có hồ sơ tái ký đã được phê duyệt.

Thông tin tạo hợp đồng phải dựa trên nội dung đã duyệt.

Không được tự ý thay đổi mức lương, phụ cấp hoặc thời hạn khác nội dung phê duyệt.

Nếu muốn thay đổi nội dung đã duyệt thì phải đưa về bước điều chỉnh và phê duyệt lại.

Không ghi đè hợp đồng cũ.

Phải tạo bản ghi hợp đồng mới trong bảng hợp đồng hiện tại.

Hợp đồng mới phải dùng cùng employee_id với hợp đồng cũ.

Phải liên kết hợp đồng mới với hợp đồng cũ thông qua previous_contract_id hoặc quan hệ tương đương.

Phải liên kết hợp đồng mới với hồ sơ tái ký đã phê duyệt.

Không cập nhật trạng thái hợp đồng cũ khi tạo hợp đồng mới; trạng thái hợp đồng cũ chỉ phản ánh thời điểm kết thúc hiệu lực thực tế.

Không cập nhật lương nhân viên tại bước này.

Lưu tài khoản tạo hợp đồng và thời gian tạo.

Sau khi tạo:

Chuyển hợp đồng sang trạng thái chờ ký hoặc trạng thái tương ứng trong hệ thống.

Chuyển hồ sơ sang trạng thái pending_sign nếu hệ thống có quản lý ký kết.

15. Bước 8 - Ký kết và hoàn tất

Công việc

Kiểm tra hợp đồng mới.

Cập nhật thông tin ký kết.

Lưu file hợp đồng đã ký: thêm bản ghi file mới, liên kết với hợp đồng mới và hồ sơ tái ký; không ghi đè hoặc xóa file hợp đồng cũ.

Cập nhật trạng thái hợp đồng mới.

Không tự động cập nhật trạng thái hợp đồng cũ; chỉ cập nhật khi hợp đồng cũ thực sự hết hạn hoặc bị chấm dứt theo quy tắc quản lý hợp đồng.

Liên kết hợp đồng mới và hợp đồng cũ.

Kiểm tra liên kết giữa hợp đồng mới, hợp đồng cũ và hồ sơ tái ký.

Đóng hồ sơ tái ký.

Lưu lịch sử.

Gửi thông báo hoàn tất.

Điều kiện hoàn tất

Hồ sơ đã được phê duyệt.

Hợp đồng mới đã được tạo.

Các thông tin bắt buộc đã đầy đủ.

Có thông tin ký kết theo quy trình của hệ thống.

File hợp đồng hoàn thiện đã được lưu và liên kết với hợp đồng mới cùng hồ sơ tái ký.

Dữ liệu liên kết hợp đồng chính xác.

Không được tự động đánh dấu hợp đồng mới đã ký nếu chưa có xác nhận ký kết thực tế.

PHẦN IV. QUẢN LÝ TRẠNG THÁI

16. Trạng thái hồ sơ tái ký

Các trạng thái đề xuất:

Mã trạng thái

Ý nghĩa

draft

Bản nháp

pending_evaluation

Chờ quản lý đánh giá

needs_revision

Cần bổ sung thông tin

pending_salary_review

Chờ C&B kiểm tra

pending_approval

Chờ Ban giám đốc phê duyệt

rejected

Bị từ chối

approved

Đã phê duyệt

pending_contract

Chờ tạo hợp đồng

pending_sign

Chờ ký hợp đồng

completed

Hoàn tất

cancelled

Đã hủy

Quy tắc chuyển trạng thái

draft → pending_evaluation.

pending_evaluation → pending_salary_review nếu có thay đổi lương, phụ cấp.

pending_evaluation → pending_approval nếu không có thay đổi lương, phụ cấp.

pending_salary_review → pending_approval sau khi C&B xác nhận.

pending_approval → approved.

approved → pending_contract.

pending_contract → pending_sign nếu có bước ký.

pending_sign → completed sau khi hoàn tất ký kết và file hợp đồng hoàn thiện đã được lưu, liên kết với hợp đồng mới và hồ sơ tái ký.

Bất kỳ bước nào bị từ chối phải lưu lý do và lịch sử.

Trạng thái thực tế phải được thống nhất với cấu trúc hiện tại và không được để một hồ sơ chuyển bước tùy ý.

17. Trạng thái hợp đồng

Phải phân biệt trạng thái hợp đồng với trạng thái hồ sơ tái ký.

Ví dụ:

draft: Bản nháp.

pending_sign: Chờ ký.

active: Đang có hiệu lực.

expired: Đã hết hạn.

terminated: Đã chấm dứt.

cancelled: Đã hủy.

Không tự ý đổi trạng thái hợp đồng cũ thành trạng thái mới khi chưa xác định đúng quy tắc nghiệp vụ.

Khi tạo hợp đồng mới sau phê duyệt, giữ nguyên trạng thái của hợp đồng cũ; trạng thái hợp đồng cũ chỉ cập nhật tại thời điểm kết thúc hiệu lực thực tế hoặc khi có quyết định chấm dứt riêng.

Hợp đồng mới bắt đầu ở trạng thái chờ ký hoặc bản nháp theo quy tắc của hệ thống và chỉ chuyển sang có hiệu lực sau khi có xác nhận ký kết thực tế.

PHẦN V. HỆ THỐNG THÔNG BÁO

18. Nguyên tắc thông báo

Tất cả tài khoản được phép truy cập hệ thống đều có thể có nút thông báo trên giao diện.

Tuy nhiên, nội dung thông báo phải phụ thuộc vào:

Quyền nghiệp vụ.

Vai trò.

Phạm vi quản lý.

Hồ sơ được phân công.

Công việc đang chờ xử lý.

Không gửi tất cả thông báo cho tất cả tài khoản một cách mặc định.

Thông báo chỉ phản ánh sự kiện, không dùng để giao việc, tiếp nhận việc, đổi người phụ trách hay xác định người xử lý. Các nội dung đó phải lưu trong bảng nhiệm vụ riêng.

19. Các loại thông báo

Sự kiện

Người nhận

Hợp đồng sắp hết hạn

Tài khoản có quyền theo dõi và phạm vi phù hợp

Có đề xuất mới

Quản lý trực tiếp được xác định cho nhân viên

Quản lý đã đánh giá

Người tạo đề xuất và bước tiếp theo

Có yêu cầu C&B kiểm tra

Tài khoản có quyền C&B phù hợp

Có hồ sơ chờ phê duyệt

Tài khoản có quyền phê duyệt và phạm vi phù hợp

Hồ sơ được phê duyệt

Tài khoản có quyền tạo hợp đồng

Có hợp đồng cần hoàn thiện

Người phụ trách bước hợp đồng

Hồ sơ hoàn tất

Người tạo và các bên liên quan

20. Chức năng thông báo cần xây dựng

Nút thông báo trên thanh điều hướng.

Hiển thị số lượng chưa đọc.

Hiển thị danh sách thông báo.

Phân biệt thông báo đã đọc và chưa đọc.

Đánh dấu thông báo đã đọc.

Nhấn thông báo để chuyển đến hồ sơ tương ứng.

Không gửi thông báo trùng lặp ngoài quy tắc.

Lưu người nhận.

Lưu thời gian tạo.

Lưu loại thông báo và trạng thái đọc.

Nếu hệ thống đã có module thông báo thì phải tái sử dụng, không tạo module thứ hai trùng chức năng.

PHẦN VI. QUẢN LÝ PHÂN CÔNG VÀ PHẠM VI HỒ SƠ

21. Nguyên tắc

Một chức vụ có thể có nhiều tài khoản có cùng quyền nghiệp vụ.

Tài khoản được xem hoặc xử lý hồ sơ phải có quyền nghiệp vụ phù hợp, nằm trong phạm vi quản lý hoặc phạm vi được giao và đang hoạt động.

Mỗi bước xử lý có một tài khoản phụ trách chính tại một thời điểm; thông tin này lưu theo từng nhiệm vụ, không lưu chung trên hồ sơ tái ký.

Không mặc định mọi tài khoản cùng chức vụ đều được quyền xem và chỉnh sửa mọi hồ sơ.

Không hardcode user_id, employee_id hoặc mã nhân viên; không chọn người nhận ngẫu nhiên.

Nếu không tìm được tài khoản hợp lệ thì chuyển nhiệm vụ sang PENDING_ASSIGNMENT.

22. Xử lý nhiều người cùng có quyền

Bước đánh giá của quản lý trực tiếp được xác định từ employees.manager_id, sau đó phải lưu tài khoản thực tế được giao.

Các bước C&B, Ban giám đốc và tạo hợp đồng do tài khoản có quyền điều phối chọn một tài khoản cụ thể từ danh sách tài khoản hợp lệ.

Người được giao xác nhận nhận việc trước hoặc tại thời điểm xử lý; chỉ người được giao mới được thực hiện bước tương ứng.

Việc thay đổi người phụ trách phải do tài khoản có quyền điều phối thực hiện, bắt buộc nhập lý do và lưu lịch sử.

Khi tài khoản bị khóa hoặc không còn quyền, nhiệm vụ chuyển về PENDING_ASSIGNMENT, ghi lịch sử và thông báo cho người điều phối.

Thiết kế bảng, trạng thái nhiệm vụ và luồng phân công chi tiết được quy định tại PHẦN XII mục 2 và mục 3.

PHẦN VII. YÊU CẦU DATABASE

23. Nguyên tắc thiết kế database

Trước khi tạo hoặc sửa bảng:

Kiểm tra toàn bộ database hiện tại.

Kiểm tra bảng nhân viên.

Kiểm tra bảng tài khoản.

Kiểm tra bảng chức vụ.

Kiểm tra bảng quyền.

Kiểm tra bảng hợp đồng.

Kiểm tra bảng thông báo.

Kiểm tra các bảng lịch sử và phân công nếu đã có.

Không được tự ý tạo bảng trùng chức năng.

24. Các nhóm dữ liệu cần quản lý

A. Dữ liệu nhân viên

Sử dụng bảng nhân viên hiện có.

Không tạo hồ sơ nhân viên mới khi tái ký.

Giữ nguyên mã nhân viên và employee_id hiện tại; hợp đồng cũ và hợp đồng mới đều tham chiếu cùng một nhân viên.

B. Dữ liệu tài khoản và phân quyền

Sử dụng hệ thống tài khoản, chức vụ, vai trò và quyền hiện có.

C. Dữ liệu hợp đồng

Sử dụng bảng hợp đồng hiện tại (`contracts`).

Bổ sung `previous_contract_id` trên bản ghi hợp đồng mới để tham chiếu hợp đồng cũ; đây là liên kết bắt buộc.

Bổ sung liên kết với hồ sơ tái ký đã phê duyệt (ví dụ `renewal_request_id`) để truy vết nguồn gốc hợp đồng mới.

Không UPDATE hoặc DELETE bản ghi hợp đồng cũ trong quy trình tái ký.

Trạng thái hợp đồng cũ chỉ được cập nhật bởi sự kiện nghiệp vụ riêng phản ánh thời điểm kết thúc hiệu lực thực tế, không phải bởi việc tạo hợp đồng mới.

D. Dữ liệu đề xuất tái ký

Cần lưu:

ID đề xuất.

ID hợp đồng cũ.

ID nhân viên.

Người tạo.

Thời gian tạo.

Thời hạn đề xuất.

Nội dung thay đổi lương.

Nội dung thay đổi phụ cấp.

Lý do tái ký.

Trạng thái.

Ghi chú.

ID hợp đồng mới (có sau khi tạo).

Người phê duyệt và thời gian phê duyệt.

Người phụ trách từng bước được truy từ bảng phân công nhiệm vụ theo hồ sơ, không lưu chung trên bảng đề xuất.

E. Dữ liệu đánh giá

Cần lưu:

ID đề xuất.

Người đánh giá.

Kết quả đánh giá.

Nhận xét.

Thời gian đánh giá.

F. Dữ liệu kiểm tra C&B

Cần lưu:

ID đề xuất.

Người kiểm tra.

Kết quả kiểm tra.

Nội dung xác nhận.

Thời gian kiểm tra.

G. Dữ liệu phê duyệt

Cần lưu:

ID đề xuất.

Người phê duyệt.

Kết quả phê duyệt.

Lý do từ chối hoặc ghi chú.

Thời gian phê duyệt.

H. Dữ liệu lịch sử

Cần lưu:

ID hồ sơ.

Tài khoản thực hiện.

Hành động.

Trạng thái trước.

Trạng thái sau.

Nội dung thay đổi.

Thời gian thực hiện.

I. Dữ liệu thông báo

Tái sử dụng bảng thông báo hiện có.

Bảng thông báo chỉ lưu sự kiện, người nhận, thời gian và trạng thái đã đọc; không lưu nhiệm vụ hay người phụ trách xử lý.

J. Dữ liệu file hợp đồng

Tái sử dụng bảng lưu file hợp đồng hiện có nếu đã có (trong database hiện tại là `contract_files`).

Mỗi lần tải lên tạo một bản ghi file mới; không ghi đè và không xóa bản ghi file của hợp đồng cũ.

Mỗi file hoàn thiện phải liên kết đồng thời với hợp đồng mới và hồ sơ tái ký tương ứng.

Cần lưu: hợp đồng sở hữu file, hồ sơ tái ký liên quan, tên file, đường dẫn lưu trữ, loại file, người tải lên và thời gian tải lên.

K. Dữ liệu lịch sử tái ký

Lưu từng hành động xử lý của hồ sơ theo quy định tại mục H.

Tái sử dụng bảng lịch sử hiện có nếu bảng đó lưu được hành động, trạng thái trước, trạng thái sau và tài khoản thực hiện; nếu không đáp ứng thì bổ sung bảng lịch sử riêng cho hồ sơ tái ký.

L. Dữ liệu phân công nhiệm vụ

Lưu nhiệm vụ theo từng bước của hồ sơ: hồ sơ, mã bước, trạng thái nhiệm vụ, tài khoản phụ trách chính, người giao, thời điểm giao, thời điểm nhận, thời điểm hoàn thành và kết quả.

Lưu lịch sử phân công gồm người giao, người nhận, người thay đổi, lý do thay đổi và thời điểm thay đổi.

Chi tiết bảng và ràng buộc được quy định tại PHẦN XII mục 2.

25. Nguyên tắc liên kết dữ liệu

Một nhân viên có thể có nhiều hợp đồng theo thời gian.

Hợp đồng mới và hợp đồng cũ phải có cùng employee_id; không tạo hồ sơ nhân viên mới khi tái ký.

Một hợp đồng cũ có thể có một hoặc nhiều hồ sơ xử lý theo quy tắc nghiệp vụ; không cho phép nhiều hồ sơ đang hoạt động trùng nhau nếu không được phép.

Một hồ sơ tái ký gắn với hợp đồng cũ cụ thể.

Một hợp đồng mới phải liên kết với hồ sơ tái ký đã được phê duyệt và liên kết với hợp đồng cũ thông qua `previous_contract_id` hoặc quan hệ tương đương.

Khi tạo hợp đồng mới, giữ nguyên dữ liệu và trạng thái của hợp đồng cũ; chỉ cập nhật trạng thái hợp đồng cũ tại thời điểm kết thúc hiệu lực thực tế.

File hợp đồng hoàn thiện phải liên kết với hợp đồng mới và hồ sơ tái ký; không ghi đè hoặc xóa file hợp đồng cũ.

Không cập nhật lương nhân viên trước khi hồ sơ tái ký hoàn tất theo quy định.

Mỗi bước xử lý phải lưu tài khoản thực hiện.

Mỗi bước có một nhiệm vụ riêng và một tài khoản phụ trách chính tại một thời điểm; thông tin này lưu trong bảng phân công, không lưu chung trên hồ sơ tái ký.

Không dùng bảng thông báo để xác định người phụ trách nhiệm vụ.

Nhân viên chỉ được xem hợp đồng và lịch sử hợp đồng của chính mình; mọi truy vấn phải lọc theo employee_id của tài khoản đang đăng nhập.

Các khóa ngoại phải được kiểm tra trước khi triển khai.

Không tự ý áp dụng tên bảng hoặc tên cột ví dụ nếu khác với quy ước database hiện tại.

PHẦN VIII. YÊU CẦU GIAO DIỆN

26. Danh sách hợp đồng sắp hết hạn

Cần có:

Bộ lọc theo phòng ban.

Bộ lọc theo nhân viên.

Bộ lọc theo trạng thái.

Bộ lọc theo thời gian hết hạn.

Ô tìm kiếm.

Danh sách hợp đồng.

Nút xem chi tiết.

Nút lập đề xuất nếu có quyền.

27. Trang chi tiết hợp đồng

Hiển thị:

Thông tin nhân viên.

Thông tin hợp đồng.

Thời hạn.

Lương và phụ cấp.

Lịch sử hợp đồng.

Trạng thái tái ký.

Lịch sử xử lý.

Danh sách file của từng hợp đồng, cho phép xem và tải xuống.

Phân biệt rõ hợp đồng cũ, hợp đồng hiện tại và hợp đồng hết hạn.

Đối với tài khoản nhân viên, chỉ hiển thị hợp đồng và lịch sử hợp đồng của chính nhân viên đó.

28. Trang đề xuất tái ký

Cần có:

Thông tin nhân viên.

Hợp đồng cũ.

Nội dung đề xuất.

Thời hạn dự kiến.

Lương và phụ cấp.

Lý do.

File đính kèm nếu cần.

Nút lưu nháp.

Nút gửi đề xuất.

29. Trang xử lý hồ sơ

Tùy quyền của tài khoản, hiển thị chức năng tương ứng:

Đánh giá.

Kiểm tra C&B.

Phê duyệt.

Tạo hợp đồng.

Yêu cầu bổ sung.

Không hiển thị nút thao tác nếu tài khoản không có quyền.

Hiển thị tài khoản phụ trách chính của từng bước và trạng thái nhiệm vụ.

Người có quyền điều phối được giao việc, chọn người nhận và đổi người phụ trách có lý do; người được giao được xác nhận nhận việc và xử lý đúng bước được giao.

Khi nhiệm vụ ở trạng thái PENDING_ASSIGNMENT, hiển thị rõ lý do và chỉ người có quyền điều phối mới được giao lại.

30. Trang lịch sử tái ký

Hiển thị:

Nhân viên.

Hợp đồng cũ.

Hợp đồng mới.

Người tạo đề xuất.

Người đánh giá.

Người kiểm tra C&B nếu có.

Người phê duyệt.

Người tạo hợp đồng.

Người phụ trách chính của từng bước.

Lịch sử giao việc, nhận việc và thay đổi người phụ trách, có lý do thay đổi.

Thời gian xử lý.

Kết quả.

File hợp đồng hoàn thiện gắn với hợp đồng mới và hồ sơ tái ký.

Trạng thái của hợp đồng cũ tại thời điểm tạo hợp đồng mới.

PHẦN IX. YÊU CẦU KỸ THUẬT

31. Kiến trúc

Phải tuân thủ mô hình MVC hiện tại của dự án.

Phân chia trách nhiệm:

Model: Truy vấn và thao tác database.

Controller: Xử lý nghiệp vụ và điều phối dữ liệu.

View: Hiển thị giao diện.

Route: Khai báo đường dẫn.

Middleware hoặc lớp phân quyền hiện có: Kiểm tra quyền truy cập.

Không tạo kiến trúc mới nếu dự án đã có cấu trúc ổn định.

32. Yêu cầu code

Tuân thủ cách đặt tên hiện tại.

Tái sử dụng các hàm và thành phần có sẵn.

Không viết lại module đang hoạt động nếu không cần thiết.

Không tạo file trùng chức năng.

Không viết logic nghiệp vụ quan trọng trực tiếp trong View.

Sử dụng truy vấn có tham số.

Kiểm tra dữ liệu đầu vào.

Xử lý lỗi rõ ràng.

Dùng transaction khi một thao tác cập nhật nhiều bảng cần đảm bảo tính toàn vẹn.

Không để người dùng gửi lại một thao tác phê duyệt đã xử lý.

Kiểm tra quyền ở phía máy chủ.

Bảo vệ các thao tác cập nhật và xóa dữ liệu.

Ghi lịch sử cho các hành động quan trọng.

Không INSERT hồ sơ nhân viên mới, không UPDATE hợp đồng cũ và không UPDATE lương nhân viên trước khi hồ sơ tái ký hoàn tất.

33. Yêu cầu bảo mật

Chỉ người đã đăng nhập mới được truy cập chức năng.

Kiểm tra quyền trước khi thực hiện thao tác.

Không tin dữ liệu employee_id, user_id hoặc role_id do trình duyệt gửi lên nếu chưa kiểm tra.

Kiểm tra phạm vi hồ sơ.

Không cho sửa hồ sơ đã kết thúc trái quy định.

Không cho phê duyệt hồ sơ sai trạng thái.

Không cho tạo hợp đồng nếu chưa được phê duyệt.

Không cho ghi đè hoặc xóa file hợp đồng cũ.

Không để người dùng thay đổi quyền bằng cách sửa URL hoặc gửi request trực tiếp.

Kiểm tra CSRF theo cơ chế bảo mật hiện tại của dự án.

PHẦN X. KIỂM THỬ

34. Kiểm thử phát hiện hợp đồng

Hợp đồng còn 90 ngày.

Hợp đồng còn 60 ngày.

Hợp đồng còn 30 ngày.

Hợp đồng đã hết hạn.

Hợp đồng đã bị hủy.

Hợp đồng không có ngày kết thúc.

Hợp đồng đã có hồ sơ tái ký.

Kiểm tra thông báo trùng lặp.

35. Kiểm thử phân quyền

Hai tài khoản cùng chức vụ đều có thể thực hiện khi được cấp quyền.

Tài khoản không có quyền không thể tạo đề xuất.

Tài khoản không có quyền không thể đánh giá.

Tài khoản không có quyền không thể phê duyệt.

Tài khoản không có quyền không thể tạo hợp đồng.

Tài khoản có quyền nhưng không thuộc phạm vi hồ sơ không được thao tác.

Thay đổi chức vụ hoặc quyền phải được áp dụng đúng.

Không có điều kiện phân quyền cố định theo mã nhân viên.

36. Kiểm thử luồng nghiệp vụ

Trường hợp 1: Tái ký không thay đổi lương

Tạo đề xuất.

Quản lý đánh giá.

Bỏ qua C&B.

Ban giám đốc phê duyệt.

Tạo hợp đồng mới.

Hoàn tất.

Trường hợp 2: Tái ký có thay đổi lương

Tạo đề xuất.

Quản lý đánh giá.

Chuyển C&B kiểm tra.

C&B xác nhận.

Ban giám đốc phê duyệt.

Tạo hợp đồng mới.

Hoàn tất.

Trường hợp 3: Quản lý không đồng ý

Tạo đề xuất.

Quản lý đánh giá.

Không đồng ý.

Lưu lý do.

Kết thúc hoặc chuyển trạng thái theo quy tắc đã thiết kế.

Trường hợp 4: Ban giám đốc từ chối

Tạo đề xuất.

Quản lý đánh giá.

Hoàn thành kiểm tra C&B nếu cần.

Ban giám đốc từ chối.

Lưu lý do.

Gửi thông báo.

Không cho tạo hợp đồng mới từ hồ sơ bị từ chối.

Trường hợp 5: Yêu cầu bổ sung

Tạo đề xuất.

Quản lý hoặc Ban giám đốc yêu cầu bổ sung.

Người có trách nhiệm nhận thông báo.

Cập nhật thông tin.

Gửi lại đúng bước cần xử lý.

Lưu toàn bộ lịch sử.

Trường hợp 6: Nhiều tài khoản cùng chức vụ

Tạo nhiều tài khoản cùng một chức vụ.

Cấp cùng quyền nghiệp vụ.

Đăng nhập bằng từng tài khoản.

Kiểm tra chức năng hiển thị.

Kiểm tra thao tác thực tế.

Kiểm tra lịch sử ghi đúng tài khoản thực hiện.

Trường hợp 7: Kiểm tra dữ liệu sau tái ký

Không tạo hồ sơ nhân viên mới; mã nhân viên và employee_id giữ nguyên.

Hợp đồng cũ giữ nguyên dữ liệu, file và lịch sử; trạng thái hợp đồng cũ không đổi khi chỉ mới tạo hợp đồng mới.

Hợp đồng mới có mã riêng, dùng cùng employee_id và có liên kết đến hợp đồng cũ.

File hợp đồng hoàn thiện được lưu bản ghi mới, liên kết với hợp đồng mới và hồ sơ tái ký.

Không cập nhật lương nhân viên trước khi hồ sơ hoàn tất.

Có thể xem hợp đồng hiện tại, các hợp đồng trước đây và file của từng hợp đồng từ hồ sơ nhân viên.

Trường hợp 8: Phân công nhiệm vụ

Mỗi bước có đúng một tài khoản phụ trách chính tại một thời điểm.

Bước đánh giá lấy quản lý từ employees.manager_id và lưu đúng tài khoản thực tế được giao.

Các bước C&B, Ban giám đốc và tạo hợp đồng do người điều phối chọn từ danh sách tài khoản hợp lệ; không hardcode và không chọn ngẫu nhiên.

Người không được giao dù có quyền vẫn không được xử lý nhiệm vụ.

Đổi người phụ trách bắt buộc có lý do và có bản ghi lịch sử phân công.

Khi không có tài khoản hợp lệ hoặc tài khoản bị khóa, mất quyền, nhiệm vụ chuyển sang PENDING_ASSIGNMENT và không tự động giao cho người khác.

Thông báo chỉ là sự kiện; không dùng thông báo để xác định người phụ trách.

Tài khoản nhân viên chỉ xem được hợp đồng và lịch sử hợp đồng của chính mình.

37. Tiêu chí nghiệm thu

Chức năng chỉ được xem là hoàn thành khi:

Hệ thống phát hiện đúng hợp đồng cần theo dõi.

Có danh sách hợp đồng sắp hết hạn.

Có thông báo đúng người nhận.

Có thể tạo đề xuất tái ký.

Có thể đánh giá.

Có thể kiểm tra C&B khi cần.

Có thể phê duyệt.

Có thể tạo hợp đồng mới sau khi phê duyệt.

Không tạo hồ sơ nhân viên mới.

Không ghi đè hợp đồng cũ.

Không đổi trạng thái hợp đồng cũ khi tạo hợp đồng mới.

Hợp đồng mới có cùng employee_id, có previous_contract_id hoặc liên kết tương đương.

File hợp đồng hoàn thiện liên kết với hợp đồng mới và hồ sơ tái ký; file cũ không bị ghi đè hoặc xóa.

Không cập nhật lương nhân viên trước khi hoàn tất.

Có thể xem lịch sử.

Phân quyền theo chức vụ và quyền nghiệp vụ.

Nhiều tài khoản cùng chức vụ có thể thực hiện khi được cấp quyền.

Mỗi bước có một người phụ trách chính, có lịch sử phân công và không có phân công trùng chéo.

Không có tài khoản hợp lệ thì nhiệm vụ ở trạng thái PENDING_ASSIGNMENT; không tự chọn người xử lý.

Thông báo chỉ là sự kiện, không thay thế nhiệm vụ.

Tài khoản nhân viên chỉ xem được hợp đồng và lịch sử hợp đồng của chính mình.

Không có mã nhân viên cố định trong logic phân quyền.

Các chức năng cũ vẫn hoạt động bình thường.

PHẦN XI. KẾ HOẠCH TRIỂN KHAI

38. Các giai đoạn triển khai

Giai đoạn 1: Khảo sát hệ thống

Kiểm tra cấu trúc dự án.

Kiểm tra database.

Kiểm tra bảng nhân viên.

Kiểm tra bảng tài khoản.

Kiểm tra chức vụ và phân quyền.

Kiểm tra bảng hợp đồng.

Kiểm tra thông báo.

Xác định các module có thể tái sử dụng.

Kết quả: Báo cáo hiện trạng hệ thống.

Giai đoạn 2: Phân tích và thiết kế

Hoàn thiện quy trình.

Xác định trạng thái.

Xác định quyền nghiệp vụ.

Xác định điều kiện chuyển bước.

Xác định người giao việc, người nhận việc, người thay đổi và người xử lý từng bước.

Thiết kế quan hệ dữ liệu.

Thiết kế giao diện.

Kết quả: Tài liệu thiết kế được thống nhất.

Giai đoạn 3: Phát hiện hợp đồng sắp hết hạn

Truy vấn hợp đồng.

Kiểm tra ngày hết hạn.

Phân loại.

Hiển thị danh sách.

Kiểm tra dữ liệu trùng.

Kết quả: Có danh sách hợp đồng cần theo dõi.

Giai đoạn 4: Thông báo

Tái sử dụng module thông báo.

Thông báo chỉ gửi sự kiện, không quản lý nhiệm vụ hay người phụ trách.

Gửi thông báo đúng người nhận.

Hiển thị số lượng chưa đọc.

Đánh dấu đã đọc.

Điều hướng đến hồ sơ.

Kết quả: Hệ thống thông báo hoạt động.

Giai đoạn 5: Tạo đề xuất

Tạo danh sách hồ sơ.

Xem chi tiết hợp đồng.

Tạo biểu mẫu.

Kiểm tra dữ liệu.

Lưu đề xuất.

Chuyển trạng thái.

Kết quả: Tạo được hồ sơ tái ký.

Giai đoạn 6: Đánh giá

Danh sách chờ đánh giá.

Xem chi tiết.

Đồng ý.

Không đồng ý.

Yêu cầu bổ sung.

Lưu lịch sử.

Kết quả: Hoàn thành bước đánh giá.

Giai đoạn 7: C&B và phê duyệt

Kiểm tra điều kiện thay đổi lương.

Xử lý nhánh C&B.

Danh sách chờ phê duyệt.

Phê duyệt hoặc từ chối.

Lưu lịch sử.

Kết quả: Hoàn thành bước phê duyệt.

Giai đoạn 8: Tạo hợp đồng mới

Lấy dữ liệu đã duyệt.

Nhập thông tin hợp đồng.

Kiểm tra dữ liệu.

Tạo bản ghi hợp đồng mới trong bảng hợp đồng hiện tại.

Giữ nguyên hồ sơ nhân viên và hợp đồng cũ.

Liên kết hợp đồng mới với hợp đồng cũ và hồ sơ tái ký.

Không cập nhật trạng thái hợp đồng cũ và không cập nhật lương nhân viên.

Kết quả: Tạo được hợp đồng mới mà không làm thay đổi hợp đồng cũ.

Giai đoạn 9: Hoàn tất và kiểm thử

Hoàn thiện ký kết.

Lưu file hợp đồng hoàn thiện, liên kết với hợp đồng mới và hồ sơ tái ký.

Cập nhật trạng thái hợp đồng mới; chỉ cập nhật trạng thái hợp đồng cũ khi hợp đồng cũ thực sự kết thúc hiệu lực.

Cập nhật lương nhân viên sau khi hoàn tất nếu quy định hiện hành yêu cầu.

Lưu lịch sử.

Kiểm thử quyền.

Kiểm thử luồng nghiệp vụ.

Kiểm thử lỗi.

Kiểm tra chức năng cũ.

Kết quả: Chức năng tái ký hoàn chỉnh.
PHẦN XII. THIẾT KẾ CẬP NHẬT THEO QUY ĐỊNH CHÍNH THỨC

1. Các nội dung cũ mâu thuẫn với yêu cầu mới

Mục 15 cũ cho phép "Cập nhật trạng thái hợp đồng cũ theo quy tắc quản lý hợp đồng" tại bước hoàn tất. Quy định chính thức yêu cầu giữ nguyên hợp đồng cũ và chỉ phản ánh trạng thái tại thời điểm kết thúc hiệu lực thực tế. Nội dung này đã được thay thế trong mục 15 và mục 17.

Mục 14 và mục 15 cũ ghi "File hợp đồng nếu hệ thống hỗ trợ" và "Lưu file hợp đồng đã ký nếu có". Quy định chính thức yêu cầu file hoàn thiện phải được lưu và liên kết với hợp đồng mới cùng hồ sơ tái ký. Nội dung này đã được thay thế trong mục 14, mục 15, mục 24.J và mục 25.

Mục 24.C cũ chỉ "xem xét bổ sung" khóa ngoại ví dụ `previous_contract_id`. Quy định chính thức yêu cầu liên kết bắt buộc giữa hợp đồng mới và hợp đồng cũ. Nội dung này đã được thay thế trong mục 14, mục 24.C và mục 25.

Mục 24.A cũ chỉ nói "Sử dụng bảng nhân viên hiện có". Quy định chính thức cấm tạo hồ sơ nhân viên mới và yêu cầu giữ nguyên mã nhân viên. Nội dung này đã được bổ sung trong mục 24.A.

Luồng hợp đồng hiện đang chạy trong code mâu thuẫn với quy định chính thức: `backend/src/services/contracts/contracts.service.js:314-353` chuyển hợp đồng cũ sang `TERMINATED` ngay khi tạo bản ghi mới, và `:355-366` cập nhật `employees.base_salary/insurance_salary` ngay khi hợp đồng mới có trạng thái `ACTIVE`. Phải bỏ hai hành động này khỏi bước tạo hợp đồng.

Form "Gia hạn / Tái ký" hiện tại ở `frontend/src/js/contracts.js:689-765, 1149-1230` gửi thẳng `POST /contracts`, bỏ qua đề xuất, đánh giá, C&B và phê duyệt. Phải đưa về luồng hồ sơ tái ký.

`hopDongCapNhat.md` thiết kế bảng `employment_contracts` và trạng thái `APPROVED_WAITING_SIGN`. Quy định chính thức yêu cầu tạo bản ghi mới trong bảng `contracts`, nên khi triển khai tái ký phải ưu tiên bảng `contracts` hiện tại.

Hệ thống phân quyền hiện có chỉ có `P01-P25`, chưa có các mã `contract_renewal.*`, `contract.create`, `contract.view`. Bảng `notifications` đã tồn tại trong database nhưng code đang chạy chưa dùng; module thông báo chỉ có trên nhánh chưa merge `origin/hop-hopdong` (`9a9432e`).

Thiết kế trước đó đặt `assigned_to_user_id` chung trên `contract_renewal_requests`, mâu thuẫn với quy định mới về một người phụ trách chính cho từng bước. Thiết kế đó đã được bỏ; người phụ trách được lưu riêng trong `contract_renewal_assignments`. Quy định mới cũng yêu cầu tách nhiệm vụ khỏi thông báo và bổ sung quyền xem hợp đồng của chính nhân viên.

2. Thiết kế database cập nhật

Giữ nguyên và không tạo lại: `employees`, `users`, `roles`, `permissions`, `role_permissions`, `departments`, `positions`, `notifications`, `contract_templates`, `contract_approval_logs`, `contract_submission_history`. Không INSERT vào `employees`, không UPDATE hoặc DELETE bản ghi `contracts` cũ.

Bảng `contracts` (đang dùng):

- Giữ nguyên toàn bộ cột hiện có, kể cả `approval_status`, `approver_id`, `approved_at`, `rejected_by`, `rejected_at`, `rejection_reason`, `revision_request`.
- Bổ sung `previous_contract_id INT NULL`, khóa ngoại tham chiếu chính `contracts.id` — liên kết bắt buộc trên bản ghi hợp đồng mới.
- Bổ sung `renewal_request_id INT NULL`, khóa ngoại tham chiếu hồ sơ tái ký đã phê duyệt.
- Bản ghi mới: `contract_code` mới, `employee_id` copy từ hợp đồng cũ, nội dung lấy từ đề xuất đã duyệt, trạng thái ban đầu là chờ ký/bản nháp, không ghi đè hợp đồng cũ.
- Có thể ghi nhận `approval_status`, `approver_id`, `approved_at` từ kết quả phê duyệt của hồ sơ để truy vết, nhưng nguồn quyết định vẫn là hồ sơ tái ký.

Bảng mới `contract_renewal_requests` (hồ sơ tái ký):

- `id`, `request_code` (duy nhất), `employee_id` (FK `employees.id`), `old_contract_id` (FK `contracts.id`), `new_contract_id` (FK `contracts.id`, NULL cho đến khi tạo hợp đồng).
- `status` theo 12 trạng thái của mục 16.
- `proposed_contract_type`, `proposed_start_date`, `proposed_end_date`.
- `salary_change_flag`, `current_salary_snapshot`, `current_allowance_snapshot`, `proposed_salary`, `proposed_allowance`.
- `reason`, `note`.
- `created_by`, `created_at`, `updated_by`, `updated_at`, `approved_by`, `approved_at`.
- Không lưu cột người phụ trách chung trên bảng này; người phụ trách được lưu theo từng bước trong `contract_renewal_assignments`.
- Không cho phép hai hồ sơ đang hoạt động cùng tồn tại cho một `old_contract_id`; kiểm tra tại tầng nghiệp vụ trong transaction.

Bảng mới `contract_renewal_evaluations`: `id`, `request_id`, `evaluator_user_id`, `result`, `comment`, `recommendation`, `created_at`.

Bảng mới `contract_renewal_salary_reviews`: `id`, `request_id`, `reviewer_user_id`, `result`, `confirmation_note`, `created_at`.

Bảng mới `contract_renewal_approvals`: `id`, `request_id`, `approver_user_id`, `result`, `reason`, `note`, `created_at`.

Bảng mới `contract_renewal_histories`: `id`, `request_id`, `actor_user_id`, `action`, `from_status`, `to_status`, `change_note`, `created_at`.

Bảng mới `contract_renewal_assignments` (nhiệm vụ theo từng bước):

- `id`, `request_id` (FK `contract_renewal_requests.id`), `step_code`, `task_status`.
- `assigned_user_id` (FK `users.id`, NULL khi `PENDING_ASSIGNMENT`), `assigned_by_user_id` (FK `users.id`), `assigned_at`, `accepted_at`, `completed_at`.
- `result`, `result_note`.
- Tại một thời điểm chỉ có một bản ghi nhiệm vụ đang hoạt động cho mỗi cặp `(request_id, step_code)`; kiểm tra trong transaction.
- `step_code` lấy từ danh sách cố định của nghiệp vụ, không lưu giá trị do trình duyệt gửi lên.

Bảng mới `contract_renewal_assignment_histories` (lịch sử phân công):

- `id`, `assignment_id` (FK `contract_renewal_assignments.id`), `request_id`, `step_code`.
- `from_user_id`, `to_user_id`, `changed_by_user_id`, `reason`, `action`, `created_at`.
- Mỗi lần giao, nhận, đổi người phụ trách, hủy hoặc hoàn thành nhiệm vụ đều ghi một bản ghi; lý do đổi người phụ trách là bắt buộc.

Kiểm tra schema hiện tại: cuộc khảo sát trước đó trên database đang chạy không thấy bảng nào lưu phân công nhiệm vụ theo hồ sơ; chỉ có phân ca làm việc `employee_shifts` và phân quyền `role_permissions`. Vì vậy đề xuất hai bảng mới nói trên. Khi triển khai phải kiểm tra lại schema thực tế để tránh tạo bảng trùng chức năng. Bước thiết kế này không chạy SQL và không thay đổi database.

Bảng `contract_files` (đang có trong database):

- Giữ nguyên các cột hiện có.
- Bổ sung `renewal_request_id INT NULL` (FK `contract_renewal_requests.id`) để liên kết file với hồ sơ tái ký.
- Bổ sung `file_kind` để phân biệt file nháp và file hoàn thiện.
- Mỗi lần tải lên tạo một bản ghi mới; không UPDATE nội dung và không DELETE bản ghi file cũ.
- File hoàn thiện phải có `contract_id` là hợp đồng mới và `renewal_request_id` là hồ sơ tương ứng.

Bảng `notifications`: tái sử dụng, không tạo bảng mới. Bảng này **chỉ lưu sự kiện** (người nhận, loại sự kiện, thời gian, trạng thái đã đọc), không lưu nhiệm vụ, người phụ trách hay trạng thái phân công. Việc phân công chỉ đọc từ `contract_renewal_assignments`. Dùng `event_key` dạng `CONTRACT_RENEWAL_<EVENT>:<request_id>` cùng khóa duy nhất hiện có `(recipient_user_id, event_key)` để chống trùng.

Quyền: bổ sung các mã đã liệt kê tại mục 6 vào `permissions` và gán qua `role_permissions`, gồm 11 mã nghiệp vụ (`contract_renewal.view`, `create`, `track`, `edit`, `evaluate`, `review_salary`, `approve`, `reject`, `history`, `cancel`, `contract.create`), `contract.view`, `contract.view.own`, `contract_renewal.history.own` và `contract_renewal.assign`. Gợi ý ánh xạ theo mục 5 (cần xác nhận trước khi áp dụng): `HR_ADMIN` = view/track/create/edit/history/assign/contract.view/contract.create; `MANAGER` = view/evaluate; `CB_PAYROLL` = view/review_salary; `DIRECTOR` = view/approve/reject; `EMPLOYEE` = contract.view.own/contract_renewal.history.own. Quyền `contract.view` chỉ dành cho phạm vi HR/quản lý được cấp. Không hardcode mã nhân viên hay tài khoản.

3. Luồng nghiệp vụ cập nhật

Bước 1 đến bước 6 giữ nguyên nội dung nghiệp vụ; phần phân công cho các bước có người phụ trách được bổ sung tại đây.

Tạo và quản lý nhiệm vụ:

- Sau khi đề xuất được gửi, hệ thống tạo nhiệm vụ `EVALUATION`: lấy `manager_id` từ `employees` của nhân viên được tái ký, tìm tài khoản đang hoạt động có quyền `contract_renewal.evaluate` và thuộc phạm vi quản lý, rồi ghi `assigned_user_id`. Nếu không có tài khoản hợp lệ, đặt `task_status = PENDING_ASSIGNMENT` và thông báo cho người có quyền `contract_renewal.assign`.
- Các bước `SALARY_REVIEW`, `APPROVAL`, `CREATE_CONTRACT`, `SIGN` do tài khoản có quyền `contract_renewal.assign` chọn một tài khoản cụ thể từ danh sách tài khoản đang hoạt động, có đúng quyền bước đó và nằm trong phạm vi hồ sơ. Không chọn ngẫu nhiên; không hardcode `user_id`, `employee_id` hoặc mã nhân viên.
- Người được giao xác nhận nhận việc (`accepted_at`) trước hoặc tại thời điểm xử lý; chỉ người được giao trong nhiệm vụ đang hoạt động mới được thực hiện bước tương ứng.
- Việc đổi người phụ trách chỉ do tài khoản có quyền `contract_renewal.assign` thực hiện, bắt buộc nhập lý do và ghi `contract_renewal_assignment_histories`.
- Khi tài khoản phụ trách bị khóa hoặc mất quyền, hệ thống chuyển nhiệm vụ về `PENDING_ASSIGNMENT`, ghi lịch sử và thông báo cho người điều phối; không tự động giao cho tài khoản khác.
- Trạng thái nhiệm vụ dùng `PENDING_ASSIGNMENT`, `ASSIGNED`, `ACCEPTED`, `IN_PROGRESS`, `COMPLETED`, `REJECTED`, `REASSIGNED`, `CANCELLED`. Chỉ khi `COMPLETED` hoặc `REJECTED` thì mới chuyển bước/hồ sơ tương ứng.
- Thông báo chỉ là sự kiện; trạng thái và người phụ trách được đọc từ `contract_renewal_assignments`.

Bước 7 - Tạo hợp đồng mới:

- Chỉ thực hiện khi hồ sơ ở trạng thái đã phê duyệt và có nhiệm vụ `CREATE_CONTRACT` đang hoạt động, người thực hiện đúng là người được giao.
- INSERT một bản ghi mới vào `contracts`, dùng cùng `employee_id`, `contract_code` riêng và nội dung đúng nội dung đã duyệt.
- Gắn `previous_contract_id` = id hợp đồng cũ và `renewal_request_id` = id hồ sơ tái ký.
- Chuyển hồ sơ sang `pending_contract`, sau đó `pending_sign` nếu có bước ký.
- Không UPDATE hợp đồng cũ, không xóa hợp đồng cũ, không cập nhật lương nhân viên.

Bước 8 - Ký kết và hoàn tất:

- Bước ký/hoàn tất chỉ thực hiện bởi người được giao nhiệm vụ `SIGN`; khi hoàn tất phải cập nhật `completed_at` và `result` của nhiệm vụ.
- Sau khi có xác nhận ký kết thực tế, INSERT bản ghi file vào `contract_files` với `contract_id` = hợp đồng mới và `renewal_request_id` = hồ sơ tái ký; không ghi đè file cũ.
- Chuyển hợp đồng mới sang trạng thái có hiệu lực theo quy tắc của hệ thống.
- Chuyển hồ sơ sang `completed` khi đã có file hoàn thiện và liên kết đúng.
- Giữ nguyên trạng thái hợp đồng cũ; chỉ cập nhật khi hợp đồng cũ thực sự hết hạn hoặc có quyết định chấm dứt riêng.
- Chỉ cập nhật lương nhân viên sau khi hồ sơ hoàn tất và nếu quy định hiện hành yêu cầu; mọi thay đổi lương phải có đánh giá C&B và phê duyệt tương ứng.
- Ghi lịch sử, gửi thông báo hoàn tất cho người tạo và các bên liên quan.

Hiển thị: hồ sơ nhân viên có quyền quản lý liệt kê toàn bộ hợp đồng trong phạm vi được cấp, phân biệt hợp đồng cũ / hiện tại / hết hạn, cho phép xem chi tiết và file của từng hợp đồng. Tài khoản nhân viên chỉ xem được hợp đồng và lịch sử của chính mình.

4. Nội dung cần thay đổi trong hệ thống (chỉ báo cáo, chưa thực hiện)

- `backend/src/services/contracts/contracts.service.js`: bỏ UPDATE `TERMINATED` hợp đồng cũ tại bước tạo (`:314-353`); bỏ UPDATE lương nhân viên tại bước tạo (`:355-366`) và chỉ cân nhắc sau `completed`.
- `backend/src/services/contracts/contracts.service.js`: thay payload `replaces_contract_id` bằng cột `previous_contract_id` được lưu trong `INSERT`; thêm `renewal_request_id`.
- `backend/src/routes/contracts.router.js`: tách luồng tạo hợp đồng thường và tạo hợp đồng từ hồ sơ tái ký đã duyệt; mỗi route kiểm tra đúng quyền.
- `frontend/src/js/contracts.js` và `frontend/src/pages/contracts.html`: nút "Gia hạn / Tái ký" phải mở luồng đề xuất thay vì gửi thẳng `POST /contracts`.
- `frontend/src/js/my-profile.js`: hiển thị tất cả hợp đồng của nhân viên và danh sách file của từng hợp đồng.
- Tạo service/controller/route/view riêng cho hồ sơ tái ký theo mô hình hiện tại, không viết lại module hợp đồng đang chạy.
- Tạo service/controller/route/view riêng cho nhiệm vụ và lịch sử phân công; mọi thao tác giao, nhận, đổi, hủy, hoàn thành nhiệm vụ phải đi qua lớp nghiệp vụ này và ghi lịch sử.
- Không đọc hoặc ghi `assigned_to_user_id` trên hồ sơ tái ký; mọi truy vấn người phụ trách phải lấy từ `contract_renewal_assignments`.
- Bổ sung các mã quyền tại mục 6 (gồm `contract_renewal.assign`, `contract.view.own`, `contract_renewal.history.own`) và gán vào `role_permissions` theo dữ liệu phân quyền hiện có.
- Kiểm tra ở tầng API: người xử lý phải là người được giao trong nhiệm vụ đang hoạt động và có đúng quyền bước; tài khoản nhân viên chỉ truy vấn khi `employee_id` khớp với JWT.
- Tái sử dụng module thông báo từ `origin/hop-hopdong` (`9a9432e`) thay vì viết module thứ hai; thông báo chỉ gửi sự kiện cho người phụ trách/người điều phối, không dùng để lưu hoặc xác định phân công.
- Các bảng/cột mới ở mục 2 chỉ được tạo khi có bước triển khai database riêng, sau khi xác nhận lại với dữ liệu thực tế.

## QUY ĐỊNH CHÍNH THỨC VỀ HỢP ĐỒNG SAU KHI TÁI KÝ

Đây là yêu cầu chính thức, thay thế các nội dung cũ nếu có mâu thuẫn.

### 1. Hồ sơ nhân viên
- Không tạo hồ sơ nhân viên mới khi tái ký.
- Giữ nguyên mã nhân viên và hồ sơ nhân viên hiện tại.
- Hợp đồng cũ và hợp đồng mới đều thuộc cùng một nhân viên.

### 2. Hợp đồng cũ
- Giữ nguyên hợp đồng cũ.
- Không xóa hợp đồng cũ.
- Không ghi đè thông tin hợp đồng cũ.
- Giữ lại file và lịch sử của hợp đồng cũ.

### 3. Hợp đồng mới
- Sau khi quy trình tái ký được phê duyệt, tạo một bản ghi hợp đồng mới trong bảng `contracts`.
- Hợp đồng mới có mã hợp đồng riêng.
- Hợp đồng mới sử dụng cùng `employee_id` với hợp đồng cũ.
- Hợp đồng mới phải có liên kết đến hợp đồng cũ thông qua `previous_contract_id` hoặc giải pháp quan hệ phù hợp với database hiện tại.
- Không tự động chuyển hợp đồng cũ sang `TERMINATED` ngay khi tạo hợp đồng mới. Trạng thái phải phản ánh thời điểm kết thúc hiệu lực thực tế.

### 4. File hợp đồng
- Khi hợp đồng mới được hoàn thiện và tải lên, lưu file gắn với hợp đồng mới.
- File phải truy xuất được từ hồ sơ nhân viên và hồ sơ tái ký tương ứng.
- Không ghi đè hoặc xóa file hợp đồng cũ.

### 5. Hiển thị hồ sơ nhân viên
- Một nhân viên có thể có nhiều hợp đồng.
- Hiển thị hợp đồng hiện tại và toàn bộ hợp đồng trước đây.
- Cho phép xem chi tiết và file của từng hợp đồng.
- Phân biệt rõ hợp đồng cũ, hợp đồng hiện tại và hợp đồng hết hạn.

### 6. Nguyên tắc dữ liệu
- Không tạo hồ sơ nhân viên mới.
- Không sửa đè hợp đồng cũ.
- Không xóa lịch sử hợp đồng.
- Lưu người tạo, người phê duyệt, thời gian và lịch sử xử lý.
- Chỉ tạo hợp đồng mới từ nội dung đã được phê duyệt.
- Không cập nhật lương nhân viên trước khi quy trình hoàn tất theo quy định.

**Lưu ý:** Nếu các phần khác trong tài liệu có nội dung trái với quy định này, phải ưu tiên quy định chính thức ở mục này.
Mỗi bước xử lý có một tài khoản phụ trách chính tại một thời điểm.

Người được giao phải có quyền nghiệp vụ phù hợp và phạm vi truy cập hồ sơ.

Bước quản lý trực tiếp xác định từ employees.manager_id và phải lưu tài khoản thực tế được giao.

Các bước C&B, Ban giám đốc và tạo hợp đồng phải cho phép người có quyền điều phối chọn một tài khoản cụ thể từ danh sách tài khoản hợp lệ.

Không hardcode user_id, employee_id hoặc mã nhân viên.

Hỗ trợ thay đổi người phụ trách, bắt buộc nhập lý do và lưu lịch sử.

Nếu không tìm được tài khoản hợp lệ thì chuyển nhiệm vụ sang PENDING_ASSIGNMENT, không tự chọn ngẫu nhiên.

Tách nhiệm vụ khỏi thông báo. Bảng notifications chỉ dùng để thông báo sự kiện.

Thiết kế bảng contract_renewal_assignments và bảng lịch sử phân công, nhưng phải kiểm tra schema hiện tại trước, tránh tạo bảng trùng chức năng.

Quy định rõ ai được giao việc, ai được nhận việc, ai được thay đổi người phụ trách và ai được xử lý từng nhiệm vụ.

Quy định rõ trạng thái nhiệm vụ, điều kiện chuyển bước và cách xử lý khi tài khoản bị khóa hoặc không còn quyền.

Lưu đầy đủ người giao, người nhận, thời điểm giao, thời điểm hoàn thành và kết quả xử lý.