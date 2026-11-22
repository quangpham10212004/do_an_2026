package com.mmp.payment.controller;

import com.mmp.payment.security.CurrentUser;
import com.mmp.payment.service.ReferralVoucherService;
import com.mmp.payment.service.ReferralVoucherService.Quote;
import com.mmp.payment.service.ReferralVoucherService.Voucher;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/payment/vouchers")
@PreAuthorize("hasAnyRole('MENTEE', 'MENTOR')")
public class VoucherController {
    private final ReferralVoucherService vouchers;

    public VoucherController(ReferralVoucherService vouchers) {
        this.vouchers = vouchers;
    }

    public record QuoteInput(UUID voucherId, @Size(max = 24) String code,
                             @NotNull @DecimalMin("0") @Digits(integer = 10, fraction = 2) BigDecimal tuition) {}

    @GetMapping("/me")
    public List<Voucher> mine() {
        return vouchers.list(CurrentUser.get().userId());
    }

    @PostMapping("/quote")
    public Quote quote(@Valid @RequestBody QuoteInput in) {
        return vouchers.quote(CurrentUser.get().userId(), in.voucherId(), in.code(), in.tuition());
    }
}
